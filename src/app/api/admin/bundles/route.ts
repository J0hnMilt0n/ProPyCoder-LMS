import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getAdminBundles, invalidateBundles } from "@/lib/page-cache";
import { MAX_SLUG_LENGTH, SLUG_PATTERN } from "@/lib/slug";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bundleInput = z.object({
  // Optional author-chosen slug, stored as the bundle id (permanent).
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
    // Admin-only, identical for every admin — cache globally. Bundle writes
    // call invalidateBundles().
    const { bundles } = await getAdminBundles(async () => ({
      bundles: await prisma.bundle.findMany({
        select: bundleSelect,
        orderBy: { updatedAt: "desc" },
      }),
    }));
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

    const { id: slugId, ...bundleFields } = parsed.data;
    const bundle = await prisma.bundle.create({
      data: {
        // Empty/absent slug falls back to the auto-generated cuid default.
        ...(slugId ? { id: slugId } : {}),
        title: bundleFields.title,
        description: bundleFields.description,
        image: bundleFields.image || null,
        price: bundleFields.price,
        status: bundleFields.status ?? "DRAFT",
        courses: {
          create: uniqueIds.map((courseId, index) => ({
            courseId,
            order: index + 1,
          })),
        },
      },
      select: bundleSelect,
    });
    invalidateBundles();
    return NextResponse.json({ bundle }, { status: 201 });
  } catch (error) {
    // A taken slug surfaces as a unique-constraint violation — report it
    // as a 409 so the form can ask for a different one.
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "That bundle URL is already taken, try another" },
        { status: 409 },
      );
    }
    console.error("Create bundle error:", error);
    return NextResponse.json(
      { error: "Failed to create bundle" },
      { status: 500 },
    );
  }
}
