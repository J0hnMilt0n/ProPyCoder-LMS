import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const text = await file.text();
    const backup = JSON.parse(text);

    if (!backup.data || !backup.version) {
      return NextResponse.json({ error: "Invalid backup file format." }, { status: 400 });
    }

    const data = backup.data;

    // Validate that the backup has the expected structure
    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "Invalid backup: missing data object." }, { status: 400 });
    }

    // Delete all existing data in reverse dependency order
    // Use a transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      await tx.answer.deleteMany();
      await tx.quizAttempt.deleteMany();
      await tx.option.deleteMany();
      await tx.question.deleteMany();
      await tx.quiz.deleteMany();
      await tx.progress.deleteMany();
      await tx.enrollment.deleteMany();
      await tx.lesson.deleteMany();
      await tx.module.deleteMany();
      await tx.liveClass.deleteMany();
      await tx.payment.deleteMany();
      await tx.certificate.deleteMany();
      await tx.notification.deleteMany();
      await tx.bundleCourse.deleteMany();
      await tx.bundle.deleteMany();
      await tx.announcement.deleteMany();
      await tx.course.deleteMany();
      await tx.user.deleteMany();

      // Insert in dependency order
      if (data.users?.length) await tx.user.createMany({ data: data.users });
      if (data.courses?.length) await tx.course.createMany({ data: data.courses });
      if (data.modules?.length) await tx.module.createMany({ data: data.modules });
      if (data.lessons?.length) await tx.lesson.createMany({ data: data.lessons });
      if (data.enrollments?.length) await tx.enrollment.createMany({ data: data.enrollments });
      if (data.progress?.length) await tx.progress.createMany({ data: data.progress });
      if (data.quizzes?.length) await tx.quiz.createMany({ data: data.quizzes });
      if (data.questions?.length) await tx.question.createMany({ data: data.questions });
      if (data.options?.length) await tx.option.createMany({ data: data.options });
      if (data.quizAttempts?.length) await tx.quizAttempt.createMany({ data: data.quizAttempts });
      if (data.answers?.length) await tx.answer.createMany({ data: data.answers });
      if (data.certificates?.length) await tx.certificate.createMany({ data: data.certificates });
      if (data.notifications?.length) await tx.notification.createMany({ data: data.notifications });
      if (data.bundles?.length) await tx.bundle.createMany({ data: data.bundles });
      if (data.payments?.length) await tx.payment.createMany({ data: data.payments });
      if (data.liveClasses?.length) await tx.liveClass.createMany({ data: data.liveClasses });
      if (data.bundleCourses?.length) await tx.bundleCourse.createMany({ data: data.bundleCourses });
      if (data.announcements?.length) await tx.announcement.createMany({ data: data.announcements });
    });

    return NextResponse.json({ ok: true, message: "Database restored successfully." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Database restore error:", message);
    return NextResponse.json({ error: `Failed to restore database: ${message}` }, { status: 500 });
  }
}