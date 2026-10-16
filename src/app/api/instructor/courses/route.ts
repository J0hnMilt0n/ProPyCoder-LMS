import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { invalidateCatalog } from "@/lib/course-cache";
import {
  NS,
  invalidateAdminOverview,
  invalidateHome,
  invalidateUser,
  userCached,
} from "@/lib/page-cache";
import { isValidOffer } from "@/lib/pricing";
import { MAX_SLUG_LENGTH, SLUG_PATTERN } from "@/lib/slug";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const courseInput = z.object({
  // Optional author-chosen slug, stored as the course id (permanent).
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
});

export async function GET() {
  try {
    const session = await auth();
    if (session?.user?.role !== "INSTRUCTOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Per-user (the instructor's own courses) — cached in-process keyed by
    // the instructor id. Course writes invalidate it.
    const { data } = await userCached(
      NS.instructorCourses,
      session.user.id,
      async () => ({
        data: await prisma.course.findMany({
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
        }),
      }),
    );

    return NextResponse.json({ data });
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

    const { id: slugId, ...courseFields } = parsed.data;
    const course = await prisma.course.create({
      data: {
        // Empty/absent slug falls back to the auto-generated cuid default.
        ...(slugId ? { id: slugId } : {}),
        ...courseFields,
        offerPrice,
        image: parsed.data.image || null,
        instructorId: session.user.id,
        status: "DRAFT",
      },
      select: { id: true, title: true, status: true },
    });

    invalidateCatalog();
    // The instructor's own course list just changed.
    invalidateUser(NS.instructorCourses, session.user.id);
    // New course moves the platform totals on the admin dashboard.
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
    console.error("Instructor course creation error:", error);
    return NextResponse.json(
      { error: "Failed to create course" },
      { status: 500 },
    );
  }
}
