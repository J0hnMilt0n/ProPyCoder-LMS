import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const courseStatuses = ["DRAFT", "PUBLISHED"] as const;

const courseUpdateInput = z.object({
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().min(20).max(5000),
  category: z.string().trim().min(2).max(60),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  price: z.number().finite().min(0),
  duration: z.number().int().min(1).max(1000),
  image: z.union([z.string().url(), z.literal("")]).optional(),
  status: z.enum(courseStatuses),
  instructorId: z.string().trim().min(1),
});

// GET full course details (admin only, used by the edit form)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const course = await prisma.course.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        level: true,
        price: true,
        duration: true,
        image: true,
        status: true,
        instructorId: true,
        instructor: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    return NextResponse.json(course);
  } catch (error) {
    console.error("Admin course fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load course" },
      { status: 500 },
    );
  }
}

// PATCH quick status toggle (admin only) — used by the publish/unpublish action
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json()) as { status?: unknown };
    if (
      typeof body.status !== "string" ||
      !courseStatuses.includes(body.status as (typeof courseStatuses)[number])
    ) {
      return NextResponse.json(
        { error: "Invalid course status" },
        { status: 400 },
      );
    }

    const course = await prisma.course.update({
      where: { id },
      data: { status: body.status },
      select: { id: true, status: true },
    });

    return NextResponse.json(course);
  } catch (error) {
    console.error("Admin course update error:", error);
    return NextResponse.json(
      { error: "Failed to update course" },
      { status: 500 },
    );
  }
}

// PUT full course update (admin only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const parsed = courseUpdateInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check the course fields and try again" },
        { status: 400 },
      );
    }

    const instructor = await prisma.user.findUnique({
      where: { id: parsed.data.instructorId },
      select: { id: true, role: true, isActive: true },
    });
    if (
      !instructor ||
      !instructor.isActive ||
      (instructor.role !== "INSTRUCTOR" && instructor.role !== "ADMIN")
    ) {
      return NextResponse.json(
        { error: "Selected instructor was not found" },
        { status: 400 },
      );
    }

    const course = await prisma.course.update({
      where: { id },
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category,
        level: parsed.data.level,
        price: parsed.data.price,
        duration: parsed.data.duration,
        image: parsed.data.image || null,
        status: parsed.data.status,
        instructorId: parsed.data.instructorId,
      },
      select: { id: true, title: true, status: true, updatedAt: true },
    });

    return NextResponse.json(course);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2025"
    ) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }
    console.error("Admin course edit error:", error);
    return NextResponse.json(
      { error: "Failed to update course" },
      { status: 500 },
    );
  }
}

// DELETE a course (admin only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const course = await prisma.course.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    await prisma.course.delete({ where: { id } });

    return NextResponse.json({ id: course.id, title: course.title });
  } catch (error) {
    console.error("Admin course deletion error:", error);
    return NextResponse.json(
      { error: "Failed to delete course" },
      { status: 500 },
    );
  }
}
