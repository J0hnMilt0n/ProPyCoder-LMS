import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { invalidateCatalog, invalidateCourse } from "@/lib/course-cache";
import {
  NS,
  invalidateAdminOverview,
  invalidateHome,
  invalidateUser,
} from "@/lib/page-cache";
import { NextRequest, NextResponse } from "next/server";

// DELETE remove a student from a course (admin only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const enrollment = await prisma.enrollment.findUnique({
      where: { id },
      select: {
        id: true,
        studentId: true,
        student: { select: { firstName: true, lastName: true } },
        course: { select: { id: true, title: true } },
      },
    });
    if (!enrollment) {
      return NextResponse.json(
        { error: "Enrollment not found" },
        { status: 404 },
      );
    }

    await prisma.enrollment.delete({ where: { id } });

    // Removing a student changes the course's cached enrollment count, the
    // platform totals on the admin dashboard + home page, and that student's
    // own dashboard list.
    invalidateCourse(enrollment.course.id);
    invalidateCatalog();
    invalidateAdminOverview();
    invalidateHome();
    invalidateUser(NS.enrollments, enrollment.studentId);
    invalidateUser(NS.purchasedCourses, enrollment.studentId);

    return NextResponse.json({ id: enrollment.id });
  } catch (error) {
    console.error("Admin enrollment removal error:", error);
    return NextResponse.json(
      { error: "Failed to remove enrollment" },
      { status: 500 },
    );
  }
}