import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/route";
import { issueCertificateForCourse } from "@/lib/certificates";

// GET progress for a course
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get("courseId");

    if (!courseId) {
      return NextResponse.json(
        { error: "courseId is required" },
        { status: 400 },
      );
    }

    const progress = await prisma.progress.findMany({
      where: {
        studentId: session.user.id,
        lesson: { module: { courseId } },
      },
      include: {
        lesson: { include: { module: true } },
      },
    });

    return NextResponse.json({ data: progress });
  } catch (error) {
    console.error("Progress fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch progress" },
      { status: 500 },
    );
  }
}

// POST update progress
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      lessonId?: unknown;
      status?: unknown;
    };
    const { lessonId } = body;
    const progressStatus = body.status ?? "STARTED";

    if (typeof lessonId !== "string" || !lessonId.trim()) {
      return NextResponse.json(
        { error: "lessonId is required" },
        { status: 400 },
      );
    }

    if (progressStatus !== "STARTED" && progressStatus !== "COMPLETED") {
      return NextResponse.json(
        { error: "Invalid progress status" },
        { status: 400 },
      );
    }

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, module: { select: { courseId: true } } },
    });

    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId: session.user.id,
          courseId: lesson.module.courseId,
        },
      },
      select: { id: true },
    });

    if (!enrollment) {
      return NextResponse.json(
        { error: "Course enrollment required" },
        { status: 403 },
      );
    }

    const progress = await prisma.progress.upsert({
      where: {
        studentId_lessonId: {
          studentId: session.user.id,
          lessonId,
        },
      },
      create: {
        studentId: session.user.id,
        lessonId,
        status: progressStatus,
        completedAt: progressStatus === "COMPLETED" ? new Date() : null,
      },
      update: {
        status: progressStatus,
        completedAt: progressStatus === "COMPLETED" ? new Date() : null,
      },
    });

    const [totalLessons, completedLessons] = await Promise.all([
      prisma.lesson.count({
        where: { module: { courseId: lesson.module.courseId } },
      }),
      prisma.progress.count({
        where: {
          studentId: session.user.id,
          status: "COMPLETED",
          lesson: { module: { courseId: lesson.module.courseId } },
        },
      }),
    ]);
    const enrollmentProgress = totalLessons
      ? Math.round((completedLessons / totalLessons) * 100)
      : 0;

    await prisma.enrollment.update({
      where: {
        studentId_courseId: {
          studentId: session.user.id,
          courseId: lesson.module.courseId,
        },
      },
      data: {
        progress: enrollmentProgress,
        status: enrollmentProgress === 100 ? "COMPLETED" : "ACTIVE",
        completedAt: enrollmentProgress === 100 ? new Date() : null,
      },
    });

    // Issue the certificate the moment the course is fully completed.
    let certificateId: string | null = null;
    if (enrollmentProgress === 100) {
      certificateId = await issueCertificateForCourse(
        session.user.id,
        lesson.module.courseId,
      );
    }

    return NextResponse.json({ ...progress, certificateId });
  } catch (error) {
    console.error("Progress update error:", error);
    return NextResponse.json(
      { error: "Failed to update progress" },
      { status: 500 },
    );
  }
}
