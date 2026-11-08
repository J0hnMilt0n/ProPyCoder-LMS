import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Return the current user's purchased course IDs grouped by published bundle.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bundles = await prisma.bundle.findMany({
      where: { status: "PUBLISHED" },
      select: {
        id: true,
        courses: { select: { courseId: true } },
      },
    });
    const courseIds = [...new Set(
      bundles.flatMap((bundle) => bundle.courses.map(({ courseId }) => courseId)),
    )];
    const enrollments = courseIds.length
      ? await prisma.enrollment.findMany({
          where: {
            studentId: session.user.id,
            courseId: { in: courseIds },
          },
          select: { courseId: true },
        })
      : [];
    const enrolledCourseIds = new Set(
      enrollments.map(({ courseId }) => courseId),
    );

    const purchases = Object.fromEntries(
      bundles.map((bundle) => [
        bundle.id,
        bundle.courses
          .filter(({ courseId }) => enrolledCourseIds.has(courseId))
          .map(({ courseId }) => courseId),
      ]),
    );

    return NextResponse.json({ purchases });
  } catch (error) {
    console.error("Bundle purchase statuses error:", error);
    return NextResponse.json(
      { error: "Failed to load purchase statuses" },
      { status: 500 },
    );
  }
}
