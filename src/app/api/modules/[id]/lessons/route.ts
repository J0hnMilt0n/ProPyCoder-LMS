import { authorizeCourseContent } from "@/lib/course-content-auth";
import { prisma } from "@/lib/prisma";
import { extractYouTubeId } from "@/lib/youtube";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const lessonInput = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  videoUrl: z.union([z.string().url(), z.literal("")]).optional(),
  duration: z.number().int().min(0).max(10000).optional(),
  isFree: z.boolean().optional(),
});

const reorderInput = z.object({
  lessonIds: z.array(z.string().trim().min(1)).min(1),
});

// POST create a lesson inside a module (admin or owning instructor)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const moduleRecord = await prisma.module.findUnique({
      where: { id },
      select: { id: true, courseId: true },
    });
    if (!moduleRecord) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }

    const access = await authorizeCourseContent(moduleRecord.courseId);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    const parsed = lessonInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check the lesson fields and try again" },
        { status: 400 },
      );
    }

    const lastLesson = await prisma.lesson.findFirst({
      where: { moduleId: id },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const videoUrl = parsed.data.videoUrl || null;
    const lesson = await prisma.lesson.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description || null,
        videoUrl,
        videoId: videoUrl ? extractYouTubeId(videoUrl) : null,
        duration: parsed.data.duration ?? null,
        isFree: parsed.data.isFree ?? false,
        order: (lastLesson?.order ?? 0) + 1,
        moduleId: id,
      },
    });

    return NextResponse.json(lesson, { status: 201 });
  } catch (error) {
    console.error("Lesson creation error:", error);
    return NextResponse.json(
      { error: "Failed to create lesson" },
      { status: 500 },
    );
  }
}

// PATCH reorder lessons within a module (admin or owning instructor)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const moduleRecord = await prisma.module.findUnique({
      where: { id },
      select: { id: true, courseId: true },
    });
    if (!moduleRecord) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }

    const access = await authorizeCourseContent(moduleRecord.courseId);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    const parsed = reorderInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Provide the ordered list of lesson ids" },
        { status: 400 },
      );
    }

    const count = await prisma.lesson.count({ where: { moduleId: id } });
    if (parsed.data.lessonIds.length !== count) {
      return NextResponse.json(
        { error: "Lesson list does not match this module" },
        { status: 400 },
      );
    }

    await prisma.$transaction(
      parsed.data.lessonIds.map((lessonId, index) =>
        prisma.lesson.updateMany({
          where: { id: lessonId, moduleId: id },
          data: { order: index + 1 },
        }),
      ),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Lesson reorder error:", error);
    return NextResponse.json(
      { error: "Failed to reorder lessons" },
      { status: 500 },
    );
  }
}