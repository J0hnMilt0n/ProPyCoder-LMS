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

    // Delete all existing data in reverse dependency order
    await prisma.answer.deleteMany();
    await prisma.quizAttempt.deleteMany();
    await prisma.option.deleteMany();
    await prisma.question.deleteMany();
    await prisma.quiz.deleteMany();
    await prisma.progress.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.lesson.deleteMany();
    await prisma.module.deleteMany();
    await prisma.liveClass.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.certificate.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.bundleCourse.deleteMany();
    await prisma.bundle.deleteMany();
    await prisma.announcement.deleteMany();
    await prisma.course.deleteMany();
    await prisma.user.deleteMany();

    // Insert in dependency order
    if (data.users?.length) await prisma.user.createMany({ data: data.users });
    if (data.courses?.length) await prisma.course.createMany({ data: data.courses });
    if (data.modules?.length) await prisma.module.createMany({ data: data.modules });
    if (data.lessons?.length) await prisma.lesson.createMany({ data: data.lessons });
    if (data.enrollments?.length) await prisma.enrollment.createMany({ data: data.enrollments });
    if (data.progress?.length) await prisma.progress.createMany({ data: data.progress });
    if (data.quizzes?.length) await prisma.quiz.createMany({ data: data.quizzes });
    if (data.questions?.length) await prisma.question.createMany({ data: data.questions });
    if (data.options?.length) await prisma.option.createMany({ data: data.options });
    if (data.quizAttempts?.length) await prisma.quizAttempt.createMany({ data: data.quizAttempts });
    if (data.answers?.length) await prisma.answer.createMany({ data: data.answers });
    if (data.certificates?.length) await prisma.certificate.createMany({ data: data.certificates });
    if (data.notifications?.length) await prisma.notification.createMany({ data: data.notifications });
    if (data.payments?.length) await prisma.payment.createMany({ data: data.payments });
    if (data.liveClasses?.length) await prisma.liveClass.createMany({ data: data.liveClasses });
    if (data.bundles?.length) await prisma.bundle.createMany({ data: data.bundles });
    if (data.bundleCourses?.length) await prisma.bundleCourse.createMany({ data: data.bundleCourses });
    if (data.announcements?.length) await prisma.announcement.createMany({ data: data.announcements });

    return NextResponse.json({ ok: true, message: "Database restored successfully." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Database restore error:", message);
    return NextResponse.json({ error: `Failed to restore database: ${message}` }, { status: 500 });
  }
}