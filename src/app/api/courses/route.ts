import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { auth } from "@/app/api/auth/[...nextauth]/route";
import {
  CATALOG_TAG,
  invalidateCatalog,
  preloadCourse,
} from "@/lib/course-cache";
import { invalidateAdminOverview, invalidateHome } from "@/lib/page-cache";

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
      // PostgreSQL `contains` is case-sensitive, so "python" would miss
      // "Python". Bundles filter with toLowerCase() client-side, which is
      // why bundle search felt fine. Use insensitive mode on Postgres.
      const isPostgres = (process.env.DATABASE_URL || "").startsWith(
        "postgres",
      );
      const textFilter = isPostgres
        ? { contains: title, mode: "insensitive" as const }
        : { contains: title };
      where.OR = [
        { title: textFilter },
        { description: textFilter },
        { category: textFilter },
      ];
    }

    // Public, read-heavy payload — serve from the cache when possible and
    // revalidate in the background (the database is remote). The persistent
    // Data Cache layer is shared across instances; the in-process layer in
    // front gives instant reads and background revalidation.
    const loader = unstable_cache(
      async () => {
        const [courses, total] = await Promise.all([
          prisma.course.findMany({
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
          }),
          prisma.course.count({ where }),
        ]);
        return {
          data: courses,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        };
      },
      ["catalog", category ?? "", level ?? "", title ?? "", String(page), String(limit)],
      { tags: [CATALOG_TAG] },
    );

    // Read directly through `unstable_cache` so a client revalidation can
    // observe the persistent cache after course/catalog invalidation.
    const payload = await loader();

    // Warm the detail + content caches for the first page of results in the
    // background, so opening a course from this list skips the database.
    // Capped so a 50-row page can't fire a flood of background queries.
    for (const course of payload.data.slice(0, 12)) {
      preloadCourse(course.id);
    }

    return NextResponse.json(payload);
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
    const {
      title,
      description,
      category,
      level,
      price,
      offerPrice,
      duration,
      image,
    } = body;

    const course = await prisma.course.create({
      data: {
        title,
        description,
        category,
        level: level || "BEGINNER",
        price: price || 0,
        offerPrice: offerPrice ? Number(offerPrice) : null,
        duration,
        image,
        instructorId: session.user.id,
        status: "DRAFT",
      },
    });

    invalidateCatalog();
    // New course moves the platform totals on the admin dashboard.
    invalidateAdminOverview();
    invalidateHome();

    return NextResponse.json(course, { status: 201 });
  } catch (error) {
    console.error("Course creation error:", error);
    return NextResponse.json(
      { error: "Failed to create course" },
      { status: 500 },
    );
  }
}
