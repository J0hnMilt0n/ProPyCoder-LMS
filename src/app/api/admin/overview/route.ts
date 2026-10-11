import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      activeStudents,
      instructorCount,
      totalCourses,
      publishedCourses,
      draftCourses,
      enrollmentCount,
      monthlyEnrollments,
      completedEnrollments,
      completedPayments,
      recentUsers,
      recentCourses,
      recentEnrollments,
      instructors,
      rawAnnouncements,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "STUDENT", isActive: true } }),
      prisma.user.count({ where: { role: "INSTRUCTOR", isActive: true } }),
      prisma.course.count(),
      prisma.course.count({ where: { status: "PUBLISHED" } }),
      prisma.course.count({ where: { status: "DRAFT" } }),
      prisma.enrollment.count(),
      prisma.enrollment.count({ where: { enrolledAt: { gte: monthStart } } }),
      prisma.enrollment.count({ where: { status: "COMPLETED" } }),
      prisma.payment.aggregate({
        where: { status: "COMPLETED" },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.user.findMany({
        where: { role: "STUDENT" },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
          createdAt: true,
          isActive: true,
          role: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.course.findMany({
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
          price: true,
          updatedAt: true,
          instructor: { select: { firstName: true, lastName: true } },
          _count: { select: { enrollments: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
      prisma.enrollment.findMany({
        select: {
          id: true,
          status: true,
          enrolledAt: true,
          student: { select: { firstName: true, lastName: true, email: true } },
          course: { select: { id: true, title: true } },
        },
        orderBy: { enrolledAt: "desc" },
        take: 20,
      }),
      prisma.user.findMany({
        where: { role: { in: ["INSTRUCTOR", "ADMIN"] } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
          createdAt: true,
          isActive: true,
          role: true,
          _count: { select: { createdCourses: true } },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
      prisma.notification.findMany({
        where: { type: "ANNOUNCEMENT" },
        select: {
          id: true,
          title: true,
          message: true,
          link: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
    ]);

    // One announcement creates one notification per recipient — group them back
    // into a single row per message so the admin sees unique announcements.
    const announcementGroups = new Map<
      string,
      {
        id: string;
        title: string;
        message: string;
        link: string | null;
        createdAt: Date;
        recipients: number;
      }
    >();
    for (const notification of rawAnnouncements) {
      const key = `${notification.title}|||${notification.message}`;
      const existing = announcementGroups.get(key);
      if (existing) existing.recipients += 1;
      else announcementGroups.set(key, { ...notification, recipients: 1 });
    }
    const recentAnnouncements = [...announcementGroups.values()].slice(0, 25);

    return NextResponse.json({
      metrics: {
        totalUsers,
        activeStudents,
        instructorCount,
        totalCourses,
        publishedCourses,
        draftCourses,
        enrollmentCount,
        monthlyEnrollments,
        completedEnrollments,
        completionRate: enrollmentCount
          ? Math.round((completedEnrollments / enrollmentCount) * 100)
          : 0,
        revenue: completedPayments._sum.amount ?? 0,
        completedPayments: completedPayments._count.id,
      },
      recentUsers,
      recentCourses,
      recentEnrollments,
      instructors,
      recentAnnouncements,
    });
  } catch (error) {
    console.error("Admin overview error:", error);
    return NextResponse.json(
      { error: "Failed to load admin overview" },
      { status: 500 },
    );
  }
}
