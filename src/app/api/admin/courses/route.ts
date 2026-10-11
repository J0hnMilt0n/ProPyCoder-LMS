import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const courseStatuses = ["DRAFT", "PUBLISHED"] as const;

const courseInput = z.object({
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().min(20).max(5000),
  category: z.string().trim().min(2).max(60),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  price: z.number().finite().min(0),
  duration: z.number().int().min(1).max(1000),
  image: z.union([z.string().url(), z.literal("")]).optional(),
  status: z.enum(courseStatuses).optional(),
  instructorId: z.string().trim().min(1).optional(),
});

// POST create a course (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = courseInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check the course fields and try again" },
        { status: 400 },
      );
    }

    const instructorId = parsed.data.instructorId ?? session.user.id;
    const instructor = await prisma.user.findUnique({
      where: { id: instructorId },
      select: { id: true, role: true, isActive: true },
    });
    if (!instructor || !instructor.isActive) {
      return NextResponse.json(
        { error: "Selected instructor was not found" },
        { status: 400 },
      );
    }
    if (instructor.role !== "INSTRUCTOR" && instructor.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Courses can only be assigned to instructors" },
        { status: 400 },
      );
    }

    const course = await prisma.course.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category,
        level: parsed.data.level,
        price: parsed.data.price,
        duration: parsed.data.duration,
        image: parsed.data.image || null,
        status: parsed.data.status ?? "DRAFT",
        instructorId,
      },
      select: { id: true, title: true, status: true },
    });

    return NextResponse.json(course, { status: 201 });
  } catch (error) {
    console.error("Admin course creation error:", error);
    return NextResponse.json(
      { error: "Failed to create course" },
      { status: 500 },
    );
  }
}