import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { invalidateCatalog } from "@/lib/course-cache";
import { isValidOffer } from "@/lib/pricing";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const courseInput = z.object({
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().min(20).max(5000),
  category: z.string().trim().min(2).max(60),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  price: z.number().finite().min(0),
  offerPrice: z.number().finite().min(0).nullable().optional(),
  duration: z.number().int().min(1).max(1000),
  image: z.union([z.string().url(), z.literal("")]).optional(),
});

export async function GET() {
  try {
    const session = await auth();
    if (session?.user?.role !== "INSTRUCTOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const courses = await prisma.course.findMany({
      where: { instructorId: session.user.id },
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        price: true,
        offerPrice: true,
        duration: true,
        updatedAt: true,
        _count: { select: { enrollments: true, modules: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ data: courses });
  } catch (error) {
    console.error("Instructor courses fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch instructor courses" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (session?.user?.role !== "INSTRUCTOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = courseInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check the course fields and try again" },
        { status: 400 },
      );
    }

    const offerPrice = parsed.data.offerPrice ?? null;
    if (!isValidOffer(parsed.data.price, offerPrice)) {
      return NextResponse.json(
        { error: "Offer price must be lower than the regular price" },
        { status: 400 },
      );
    }

    const course = await prisma.course.create({
      data: {
        ...parsed.data,
        offerPrice,
        image: parsed.data.image || null,
        instructorId: session.user.id,
        status: "DRAFT",
      },
      select: { id: true, title: true, status: true },
    });

    invalidateCatalog();

    return NextResponse.json(course, { status: 201 });
  } catch (error) {
    console.error("Instructor course creation error:", error);
    return NextResponse.json(
      { error: "Failed to create course" },
      { status: 500 },
    );
  }
}
