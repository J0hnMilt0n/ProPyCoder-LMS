import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Return only this authenticated user's enrollments among a bundle's courses.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const bundle = await prisma.bundle.findFirst({
      where: { id, status: "PUBLISHED" },
      select: { courses: { select: { courseId: true } } },
    });

    if (!bundle) {
      return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
    }

    const enrollments = await prisma.enrollment.findMany({
      where: {
        studentId: session.user.id,
        courseId: { in: bundle.courses.map(({ courseId }) => courseId) },
      },
      select: { courseId: true },
    });

    return NextResponse.json({ courseIds: enrollments.map(({ courseId }) => courseId) });
  } catch (error) {
    console.error("Bundle purchase status error:", error);
    return NextResponse.json(
      { error: "Failed to load purchase status" },
      { status: 500 },
    );
  }
}