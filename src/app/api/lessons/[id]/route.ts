import { authorizeCourseContent } from "@/lib/course-content-auth";
import { prisma } from "@/lib/prisma";
import { extractYouTubeId } from "@/lib/youtube";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const lessonUpdateInput = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(1000).optional(),
  videoUrl: z.union([z.string().url(), z.literal("")]).optional(),
  duration: z.number().int().min(0).max(10000).nullable().optional(),
  isFree: z.boolean().optional(),
});

// PATCH update a lesson (admin or owning instructor)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const lesson = await prisma.lesson.findUnique({
      where: { id },
      select: { id: true, module: { select: { courseId: true } } },
    });
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const access = await authorizeCourseContent(lesson.module.courseId);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    const parsed = lessonUpdateInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check the lesson fields and try again" },
        { status: 400 },
      );
    }

    const data: {
      title?: string;
      description?: string | null;
      videoUrl?: string | null;
      videoId?: string | null;
      duration?: number | null;
      isFree?: boolean;
    } = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.description !== undefined)
      data.description = parsed.data.description || null;
    if (parsed.data.videoUrl !== undefined) {
      data.videoUrl = parsed.data.videoUrl || null;
      data.videoId = parsed.data.videoUrl
        ? extractYouTubeId(parsed.data.videoUrl)
        : null;
    }
    if (parsed.data.duration !== undefined)
      data.duration = parsed.data.duration;
    if (parsed.data.isFree !== undefined) data.isFree = parsed.data.isFree;

    const updated = await prisma.lesson.update({ where: { id }, data });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Lesson update error:", error);
    return NextResponse.json(
      { error: "Failed to update lesson" },
      { status: 500 },
    );
  }
}

// DELETE a lesson (admin or owning instructor)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const lesson = await prisma.lesson.findUnique({
      where: { id },
      select: { id: true, module: { select: { courseId: true } } },
    });
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const access = await authorizeCourseContent(lesson.module.courseId);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    await prisma.lesson.delete({ where: { id } });

    return NextResponse.json({ id });
  } catch (error) {
    console.error("Lesson deletion error:", error);
    return NextResponse.json(
      { error: "Failed to delete lesson" },
      { status: 500 },
    );
  }
}