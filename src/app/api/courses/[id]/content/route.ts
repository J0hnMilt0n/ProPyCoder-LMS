import { authorizeCourseContent } from "@/lib/course-content-auth";
import { prisma } from "@/lib/prisma";
import { getCourseModules, invalidateCourse } from "@/lib/course-cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const moduleInput = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
});

const reorderInput = z.object({
  moduleIds: z.array(z.string().trim().min(1)).min(1),
});

// GET modules with lessons (admin or owning instructor)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await authorizeCourseContent(id);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    // Same cached modules the student-facing endpoint reads — writes below
    // invalidate this key, so the editor and the course page stay in sync.
    const modules = await getCourseModules(id);

    return NextResponse.json({ modules });
  } catch (error) {
    console.error("Course content fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load course content" },
      { status: 500 },
    );
  }
}

// POST create a module (admin or owning instructor)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await authorizeCourseContent(id);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    const parsed = moduleInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Add a module title (2-120 characters)" },
        { status: 400 },
      );
    }

    const lastModule = await prisma.module.findFirst({
      where: { courseId: id },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const newModule = await prisma.module.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description || null,
        order: (lastModule?.order ?? 0) + 1,
        courseId: id,
      },
      include: { lessons: true },
    });

    invalidateCourse(id);

    return NextResponse.json(newModule, { status: 201 });
  } catch (error) {
    console.error("Module creation error:", error);
    return NextResponse.json(
      { error: "Failed to create module" },
      { status: 500 },
    );
  }
}

// PATCH reorder modules within a course (admin or owning instructor)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await authorizeCourseContent(id);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    const parsed = reorderInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Provide the ordered list of module ids" },
        { status: 400 },
      );
    }

    const count = await prisma.module.count({ where: { courseId: id } });
    if (parsed.data.moduleIds.length !== count) {
      return NextResponse.json(
        { error: "Module list does not match this course" },
        { status: 400 },
      );
    }

    await prisma.$transaction(
      parsed.data.moduleIds.map((moduleId, index) =>
        prisma.module.updateMany({
          where: { id: moduleId, courseId: id },
          data: { order: index + 1 },
        }),
      ),
    );

    invalidateCourse(id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Module reorder error:", error);
    return NextResponse.json(
      { error: "Failed to reorder modules" },
      { status: 500 },
    );
  }
}