import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bundleInput = z.object({
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().min(20).max(5000),
  image: z.union([z.string().url(), z.literal("")]).optional(),
  price: z.number().finite().min(0),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  courseIds: z.array(z.string().trim().min(1)).min(2).max(20),
});

const bundleSelect = {
  id: true,
  title: true,
  description: true,
  image: true,
  price: true,
  status: true,
  updatedAt: true,
  courses: {
    select: {
      order: true,
      course: {
        select: {
          id: true,
          title: true,
          price: true,
          offerPrice: true,
          image: true,
          status: true,
        },
      },
    },
    orderBy: { order: "asc" as const },
  },
};

// GET all bundles (admin only)
export async function GET() {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const bundles = await prisma.bundle.findMany({
      select: bundleSelect,
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ bundles });
  } catch (error) {
    console.error("Admin bundles error:", error);
    return NextResponse.json(
      { error: "Failed to load bundles" },
      { status: 500 },
    );
  }
}

// POST create a bundle of 2+ courses (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = bundleInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Add a title, description, price and at least 2 courses" },
        { status: 400 },
      );
    }

    const uniqueIds = [...new Set(parsed.data.courseIds)];
    if (uniqueIds.length < 2) {
      return NextResponse.json(
        { error: "A bundle needs at least 2 different courses" },
        { status: 400 },
      );
    }
    const courses = await prisma.course.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    if (courses.length !== uniqueIds.length) {
      return NextResponse.json(
        { error: "One or more selected courses were not found" },
        { status: 400 },
      );
    }

    const bundle = await prisma.bundle.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        image: parsed.data.image || null,
        price: parsed.data.price,
        status: parsed.data.status ?? "DRAFT",
        courses: {
          create: uniqueIds.map((courseId, index) => ({
            courseId,
            order: index + 1,
          })),
        },
      },
      select: bundleSelect,
    });
    return NextResponse.json({ bundle }, { status: 201 });
  } catch (error) {
    console.error("Create bundle error:", error);
    return NextResponse.json(
      { error: "Failed to create bundle" },
      { status: 500 },
    );
  }
}
