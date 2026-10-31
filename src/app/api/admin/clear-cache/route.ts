import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { invalidateCourse, invalidateCatalog } from "@/lib/course-cache";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const courseIds: string[] = Array.isArray(body.courseIds)
      ? body.courseIds.map((id: unknown) => String(id).trim()).filter(Boolean)
      : typeof body.courseId === "string" && body.courseId.trim()
        ? [body.courseId.trim()]
        : [];

    if (courseIds.length > 0) {
      for (const courseId of courseIds) {
        invalidateCourse(courseId);
        revalidateTag(`course:${courseId}`, "max");
        revalidateTag(`modules:${courseId}`, "max");
      }
      return NextResponse.json({
        ok: true,
        message: `Cache invalidated for ${courseIds.length} course(s)`,
      });
    }

    invalidateCatalog();
    revalidateTag("catalog", "max");
    return NextResponse.json({ ok: true, message: "Catalog cache invalidated" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Clear cache error:", message);
    return NextResponse.json({ error: "Failed to clear cache." }, { status: 500 });
  }
}