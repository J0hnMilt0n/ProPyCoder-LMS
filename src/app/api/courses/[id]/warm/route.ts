import { NextResponse } from "next/server";
import { preloadCourse } from "@/lib/course-cache";

/**
 * Warm a course's detail + content caches in the background.
 *
 * Called on hover/focus of a catalog card so that by the time the user
 * actually navigates to /courses/[id], the database round trips are already
 * cached. No auth here — this only pre-populates the public detail/module
 * cache; access redaction (which lessons a user may see) is still enforced
 * per-request in the real endpoints.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  preloadCourse(id);
  return new NextResponse(null, { status: 204 });
}
