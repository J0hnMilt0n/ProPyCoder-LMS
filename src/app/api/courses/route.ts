import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/route";

// GET all courses
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const level = searchParams.get("level");
    const title = searchParams.get("title")?.trim().slice(0, 100);
    const page = Math.max(
      1,
      Number.parseInt(searchParams.get("page") || "1", 10) || 1,
    );
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(searchParams.get("limit") || "10", 10) || 10),
    );

    const where: Prisma.CourseWhereInput = { status: "PUBLISHED" };
    if (category) where.category = category;
    if (level) where.level = level;
    if (title) {
      where.OR = [
        { title: { contains: title } },
        { description: { contains: title } },
        { category: { contains: title } },
      ];
    }

    const courses = await prisma.course.findMany({
      where,
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        _count: {
          select: { enrollments: true },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    const total = await prisma.course.count({ where });

    return NextResponse.json({
      data: courses,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Course fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch courses" },
      { status: 500 },
    );
  }
}

// POST create course (instructor only)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user?.role !== "INSTRUCTOR") {
      return NextResponse.json(
        { error: "Unauthorized - Instructor access required" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { title, description, category, level, price, duration, image } =
      body;

    const course = await prisma.course.create({
      data: {
        title,
        description,
        category,
        level: level || "BEGINNER",
        price: price || 0,
        duration,
        image,
        instructorId: session.user.id,
        status: "DRAFT",
      },
    });

    return NextResponse.json(course, { status: 201 });
  } catch (error) {
    console.error("Course creation error:", error);
    return NextResponse.json(
      { error: "Failed to create course" },
      { status: 500 },
    );
  }
}
