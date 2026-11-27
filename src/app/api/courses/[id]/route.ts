import { NextRequest, NextResponse } from "next/server";
import { getCourseDetail } from "@/lib/course-cache";
import { CATALOG_CACHE_CONTROL } from "@/lib/config";
import { logger } from "@/lib/logger";

export const revalidate = 2592000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Cached — course details are public and read far more often than the
    // rare write (which invalidates this key).
    const course = await getCourseDetail(id);

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    return NextResponse.json(course, {
      headers: {
        "Cache-Control": CATALOG_CACHE_CONTROL,
      },
    });
  } catch (error) {
    logger.error("Course fetch error", {
      cause: error instanceof Error ? error : undefined,
      metadata: { error: String(error) },
    });
    return NextResponse.json(
      { error: "Failed to fetch course" },
      { status: 500 },
    );
  }
}
