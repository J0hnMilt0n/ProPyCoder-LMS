import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { invalidateCatalog, invalidateCourse } from "@/lib/course-cache";
import { clearCourseResourceCache } from "@/lib/use-resource";
import {
  NS,
  invalidateAdminOverview,
  invalidateHome,
  invalidateUser,
} from "@/lib/page-cache";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// POST manually enroll a student in a course (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { studentId, courseId } = body;
    if (!studentId || !courseId) {
      return NextResponse.json(
        { error: "studentId and courseId are required" },
        { status: 400 },
      );
    }

    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, role: true },
    });
    if (!student || student.role !== "STUDENT") {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const existing = await prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Already enrolled in this course" },
        { status: 400 },
      );
    }

    const enrollment = await prisma.enrollment.create({
      data: { studentId, courseId, status: "ACTIVE" },
      include: {
        student: { select: { firstName: true, lastName: true, email: true } },
        course: { select: { id: true, title: true } },
      },
    });

    invalidateCourse(courseId);
    invalidateCatalog();
    clearCourseResourceCache(courseId);
    invalidateAdminOverview();
    invalidateHome();
    invalidateUser(NS.enrollments, studentId);
    invalidateUser(NS.purchasedCourses, studentId);

    return NextResponse.json(enrollment, { status: 201 });
  } catch (error) {
    logger.error("Admin enrollment creation error", {
      cause: error instanceof Error ? error : undefined,
      metadata: { error: String(error) },
    });
    return NextResponse.json(
      { error: "Failed to enroll student" },
      { status: 500 },
    );
  }
}
