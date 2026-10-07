import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const courseStatuses = ["DRAFT", "PUBLISHED"] as const;

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
    const body = (await request.json()) as { status?: unknown };
    if (
      typeof body.status !== "string" ||
      !courseStatuses.includes(body.status as (typeof courseStatuses)[number])
    ) {
      return NextResponse.json(
        { error: "Invalid course status" },
        { status: 400 },
      );
    }

    const course = await prisma.course.update({
      where: { id },
      data: { status: body.status },
      select: { id: true, status: true },
    });

    return NextResponse.json(course);
  } catch (error) {
    console.error("Admin course update error:", error);
    return NextResponse.json(
      { error: "Failed to update course" },
      { status: 500 },
    );
  }
}
