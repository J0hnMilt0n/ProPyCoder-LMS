import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { serializeLiveClass } from "@/lib/live-classes";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const liveClassPatch = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  provider: z.enum(["GOOGLE_MEET", "ZOOM", "TEAMS", "OTHER"]).optional(),
  meetingUrl: z.string().url().max(500).optional(),
  meetingId: z.string().trim().max(80).optional(),
  passcode: z.string().trim().max(80).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  status: z.enum(["SCHEDULED", "LIVE", "ENDED", "CANCELLED"]).optional(),
});

const liveClassInclude = {
  course: { select: { id: true, title: true } },
  instructor: { select: { id: true, firstName: true, lastName: true } },
} as const;

async function findAuthorizedLiveClass(id: string, userId: string, role: string) {
  const existing = await prisma.liveClass.findUnique({ where: { id } });
  if (!existing) return { error: "Live class not found" as const, status: 404 };
  if (role !== "ADMIN" && existing.instructorId !== userId) {
    return { error: "You can only manage your own live classes" as const, status: 403 };
  }
  return { liveClass: existing };
}

// PATCH /api/live-classes/[id] — edit, start, end or cancel a class
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (session?.user?.role !== "INSTRUCTOR" && session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    const authz = await findAuthorizedLiveClass(
      id,
      session.user.id ?? "",
      session.user.role ?? "",
    );
    if ("error" in authz) {
      return NextResponse.json({ error: authz.error }, { status: authz.status });
    }

    const parsed = liveClassPatch.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check the live class fields and try again" },
        { status: 400 },
      );
    }
    const data = parsed.data;
    const startsAt = data.startsAt ?? authz.liveClass.startsAt;
    const endsAt = data.endsAt ?? authz.liveClass.endsAt;
    if (endsAt.getTime() <= startsAt.getTime()) {
      return NextResponse.json(
        { error: "The end time must be after the start time" },
        { status: 400 },
      );
    }

    const updated = await prisma.liveClass.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && {
          description: data.description || null,
        }),
        ...(data.provider !== undefined && { provider: data.provider }),
        ...(data.meetingUrl !== undefined && { meetingUrl: data.meetingUrl }),
        ...(data.meetingId !== undefined && {
          meetingId: data.meetingId || null,
        }),
        ...(data.passcode !== undefined && { passcode: data.passcode || null }),
        ...(data.startsAt !== undefined && { startsAt: data.startsAt }),
        ...(data.endsAt !== undefined && { endsAt: data.endsAt }),
        ...(data.status !== undefined && { status: data.status }),
      },
      include: liveClassInclude,
    });

    return NextResponse.json({ data: serializeLiveClass(updated) });
  } catch (error) {
    console.error("Live class PATCH error:", error);
    return NextResponse.json(
      { error: "Could not update the live class" },
      { status: 500 },
    );
  }
}

// DELETE /api/live-classes/[id] — remove a class (owner instructor or admin)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (session?.user?.role !== "INSTRUCTOR" && session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    const authz = await findAuthorizedLiveClass(
      id,
      session.user.id ?? "",
      session.user.role ?? "",
    );
    if ("error" in authz) {
      return NextResponse.json({ error: authz.error }, { status: authz.status });
    }

    await prisma.liveClass.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Live class DELETE error:", error);
    return NextResponse.json(
      { error: "Could not delete the live class" },
      { status: 500 },
    );
  }
}
