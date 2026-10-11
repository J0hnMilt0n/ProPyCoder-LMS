import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const updateInput = z
  .object({
    isActive: z.boolean().optional(),
    role: z.enum(["STUDENT", "INSTRUCTOR"]).optional(),
  })
  .refine((data) => data.isActive !== undefined || data.role !== undefined, {
    message: "Provide isActive or role",
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const parsed = updateInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Provide a valid isActive flag or role" },
        { status: 400 },
      );
    }

    if (id === session.user.id) {
      return NextResponse.json(
        { error: "You cannot change your own account" },
        { status: 400 },
      );
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!target || target.role === "ADMIN") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(parsed.data.isActive !== undefined
          ? { isActive: parsed.data.isActive }
          : {}),
        ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
      },
      select: { id: true, isActive: true, role: true },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Admin user update error:", error);
    return NextResponse.json(
      { error: "Failed to update student" },
      { status: 500 },
    );
  }
}
