import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [
      users,
      courses,
      modules,
      lessons,
      enrollments,
      progress,
      quizzes,
      questions,
      options,
      quizAttempts,
      answers,
      certificates,
      notifications,
      payments,
      liveClasses,
      bundles,
      bundleCourses,
      announcements,
    ] = await Promise.all([
      prisma.user.findMany(),
      prisma.course.findMany(),
      prisma.module.findMany(),
      prisma.lesson.findMany(),
      prisma.enrollment.findMany(),
      prisma.progress.findMany(),
      prisma.quiz.findMany(),
      prisma.question.findMany(),
      prisma.option.findMany(),
      prisma.quizAttempt.findMany(),
      prisma.answer.findMany(),
      prisma.certificate.findMany(),
      prisma.notification.findMany(),
      prisma.payment.findMany(),
      prisma.liveClass.findMany(),
      prisma.bundle.findMany(),
      prisma.bundleCourse.findMany(),
      prisma.announcement.findMany(),
    ]);

    const backup = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      data: {
        users,
        courses,
        modules,
        lessons,
        enrollments,
        progress,
        quizzes,
        questions,
        options,
        quizAttempts,
        answers,
        certificates,
        notifications,
        payments,
        liveClasses,
        bundles,
        bundleCourses,
        announcements,
      },
    };

    const json = JSON.stringify(backup, null, 2);
    const filename = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Database backup error:", message);
    return NextResponse.json({ error: "Failed to create backup." }, { status: 500 });
  }
}