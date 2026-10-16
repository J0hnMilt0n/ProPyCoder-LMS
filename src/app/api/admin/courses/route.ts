import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { invalidateCatalog } from "@/lib/course-cache";
import { invalidateAdminOverview, invalidateHome } from "@/lib/page-cache";
import { isValidOffer } from "@/lib/pricing";
import { MAX_SLUG_LENGTH, SLUG_PATTERN } from "@/lib/slug";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const courseStatuses = ["DRAFT", "PUBLISHED"] as const;

const courseInput = z.object({
  // Optional author-chosen slug, stored as the course id (permanent).
  // Empty/absent keeps the auto-generated cuid behaviour.
  id: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(MAX_SLUG_LENGTH)
    .regex(
      SLUG_PATTERN,
      "Slug may only contain lowercase letters, numbers and hyphens",
    )
    .optional()
    .or(z.literal("")),
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().min(20).max(5000),
  category: z.string().trim().min(2).max(60),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  price: z.number().finite().min(0),
  offerPrice: z.number().finite().min(0).nullable().optional(),
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

    const offerPrice = parsed.data.offerPrice ?? null;
    if (!isValidOffer(parsed.data.price, offerPrice)) {
      return NextResponse.json(
        { error: "Offer price must be lower than the regular price" },
        { status: 400 },
      );
    }

    const course = await prisma.course.create({
      data: {
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category,
        level: parsed.data.level,
        price: parsed.data.price,
        offerPrice,
        duration: parsed.data.duration,
        image: parsed.data.image || null,
        status: parsed.data.status ?? "DRAFT",
        instructorId,
      },
      select: { id: true, title: true, status: true },
    });

    invalidateCatalog();
    // Course totals on the admin dashboard and the home page counts changed.
    invalidateAdminOverview();
    invalidateHome();

    return NextResponse.json(course, { status: 201 });
  } catch (error) {
    // A taken slug surfaces as a unique-constraint violation — report it
    // as a 409 so the form can ask for a different one.
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "That course URL is already taken, try another" },
        { status: 409 },
      );
    }
    console.error("Admin course creation error:", error);
    return NextResponse.json(
      { error: "Failed to create course" },
      { status: 500 },
    );
  }
}