import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/route";
import { extractYouTubeId } from "@/lib/youtube";

// GET lessons for a course (only accessible to enrolled users or for free previews)
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get("courseId");

    if (!courseId) {
      return NextResponse.json(
        { error: "Course ID is required" },
        { status: 400 }
      );
    }

    // Get all modules for the course with their lessons
    const modules = await prisma.module.findMany({
      where: { courseId },
      include: {
        lessons: { orderBy: { order: "asc" } },
      },
      orderBy: { order: "asc" },
    });

    // Check if user is enrolled (for showing all lessons)
    let isEnrolled = false;
    if (session) {
      const enrollment = await prisma.enrollment.findUnique({
        where: {
          studentId_courseId: {
            studentId: session.user.id,
            courseId,
          },
        },
      });
      isEnrolled = !!enrollment;
    }

    // If not enrolled, only show free preview lessons
    const lessonsWithAccess = modules.map((module) => ({
      ...module,
      lessons: module.lessons.map((lesson) => ({
        ...lesson,
        // Only include videoUrl/videoId if user is enrolled or lesson is free
        videoUrl: isEnrolled || lesson.isFree ? lesson.videoUrl : null,
        videoId: isEnrolled || lesson.isFree ? lesson.videoId : null,
      })),
    }));

    return NextResponse.json({
      modules: lessonsWithAccess,
      isEnrolled,
    });
  } catch (error) {
    console.error("Lessons fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch lessons" },
      { status: 500 }
    );
  }
}

// POST create lesson (instructor only)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user?.role !== "INSTRUCTOR") {
      return NextResponse.json(
        { error: "Unauthorized - Instructor access required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { title, description, moduleId, order, videoUrl, duration, isFree } = body;

    // Verify instructor owns the course (through module)
    const moduleRecord = await prisma.module.findUnique({
      where: { id: moduleId },
      include: { course: true },
    });

    if (!moduleRecord) {
      return NextResponse.json(
        { error: "Module not found" },
        { status: 404 }
      );
    }

    if (moduleRecord.course.instructorId !== session.user.id) {
      return NextResponse.json(
        { error: "You can only add lessons to your own courses" },
        { status: 403 }
      );
    }

    // Extract YouTube video ID if videoUrl is provided
    const videoId = videoUrl ? extractYouTubeId(videoUrl) : null;

    const lesson = await prisma.lesson.create({
      data: {
        title,
        description,
        moduleId,
        order: order || 0,
        videoUrl,
        videoId,
        duration,
        isFree: isFree || false,
      },
    });

    return NextResponse.json(lesson, { status: 201 });
  } catch (error) {
    console.error("Lesson creation error:", error);
    return NextResponse.json(
      { error: "Failed to create lesson" },
      { status: 500 }
    );
  }
}