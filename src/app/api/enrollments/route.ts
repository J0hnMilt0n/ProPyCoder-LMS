import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/route";
import { invalidateCatalog, invalidateCourse } from "@/lib/course-cache";
import { NS, invalidateUser, userCached } from "@/lib/page-cache";

// GET user's enrollments
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Per-user — cached in-process keyed by the user id, never in the shared
    // persistent cache. Enroll/payment/removal writes invalidate it.
    const { data } = await userCached(
      NS.enrollments,
      session.user.id,
      async () => ({
        data: await prisma.enrollment.findMany({
          where: { studentId: session.user.id },
          include: {
            course: {
              include: {
                instructor: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
          orderBy: { enrolledAt: "desc" },
        }),
      }),
    );

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Enrollment fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch enrollments" },
      { status: 500 },
    );
  }
}

// POST enroll in course
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { courseId } = body;

    // Check if already enrolled
    const existing = await prisma.enrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId: session.user.id,
          courseId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Already enrolled in this course" },
        { status: 400 },
      );
    }

    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: session.user.id,
        courseId,
        status: "ACTIVE",
      },
      include: {
        course: true,
      },
    });

    // The catalog and course detail cache the enrollment count.
    invalidateCourse(courseId);
    invalidateCatalog();
    // The enrolling student's dashboard list just changed.
    invalidateUser(NS.enrollments, session.user.id);

    return NextResponse.json(enrollment, { status: 201 });
  } catch (error) {
    console.error("Enrollment creation error:", error);
    return NextResponse.json(
      { error: "Failed to enroll in course" },
      { status: 500 },
    );
  }
}
