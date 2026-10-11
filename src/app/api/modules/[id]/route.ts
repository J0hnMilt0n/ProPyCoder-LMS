import { authorizeCourseContent } from "@/lib/course-content-auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const moduleUpdateInput = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).optional(),
});

async function getModuleCourseId(moduleId: string) {
  const moduleRecord = await prisma.module.findUnique({
    where: { id: moduleId },
    select: { id: true, courseId: true, order: true },
  });
  return moduleRecord;
}

// PATCH update a module (admin or owning instructor)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const moduleRecord = await getModuleCourseId(id);
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

    const parsed = moduleUpdateInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check the module fields and try again" },
        { status: 400 },
      );
    }

    const updated = await prisma.module.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description || null }
          : {}),
      },
      include: { lessons: { orderBy: { order: "asc" } } },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Module update error:", error);
    return NextResponse.json(
      { error: "Failed to update module" },
      { status: 500 },
    );
  }
}

// DELETE a module and its lessons (admin or owning instructor)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const moduleRecord = await getModuleCourseId(id);
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

    await prisma.module.delete({ where: { id } });

    return NextResponse.json({ id });
  } catch (error) {
    console.error("Module deletion error:", error);
    return NextResponse.json(
      { error: "Failed to delete module" },
      { status: 500 },
    );
  }
}