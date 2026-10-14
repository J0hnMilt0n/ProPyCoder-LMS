import { unstable_cache } from "next/cache";
import { revalidateTag } from "next/cache";
import { cached, invalidate, preload, type CacheOptions } from "@/lib/data-cache";
import { prisma } from "@/lib/prisma";

/**
 * Course catalog/detail/content change rarely and are read far more often
 * than they are written — cache them briefly and revalidate in the
 * background. Writes call invalidateCourse()/invalidateCatalog().
 *
 * Two layers:
 *  1. Next.js persistent Data Cache (unstable_cache) — shared across every
 *     server instance and survives restarts. Tagged per course so a write
 *     can purge it on demand via revalidateTag (stale-while-revalidate).
 *  2. The in-process cache in front of it — gives instant reads and lets a
 *     stale entry be served immediately while one background refresh runs.
 */
export const COURSE_CACHE: CacheOptions = { freshMs: 30_000, staleMs: 60_000 };

/** Cache tags used by revalidateTag for on-demand invalidation. */
export function courseTag(courseId: string): string {
  return `course:${courseId}`;
}
export function modulesTag(courseId: string): string {
  return `modules:${courseId}`;
}
export const CATALOG_TAG = "catalog";

/** Detail payload served by GET /api/courses/[id]. */
export function loadCourseDetail(courseId: string) {
  return prisma.course.findUnique({
    where: { id: courseId },
    include: {
      instructor: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
      modules: {
        select: {
          id: true,
          title: true,
        },
      },
      _count: {
        select: { enrollments: true },
      },
    },
  });
}

/** Persistent (shared, restart-surviving) copy, purged by revalidateTag. */
const getPersistentCourseDetail = (courseId: string) =>
  unstable_cache(() => loadCourseDetail(courseId), ["course", courseId], {
    tags: [courseTag(courseId), CATALOG_TAG],
  });

export function getCourseDetail(courseId: string) {
  return cached(
    `course:${courseId}:`,
    () => getPersistentCourseDetail(courseId)(),
    COURSE_CACHE,
  );
}

/** Raw modules + lessons (per-request access redaction stays with callers). */
export function loadCourseModules(courseId: string) {
  return prisma.module.findMany({
    where: { courseId },
    include: { lessons: { orderBy: { order: "asc" } } },
    orderBy: { order: "asc" },
  });
}

const getPersistentCourseModules = (courseId: string) =>
  unstable_cache(() => loadCourseModules(courseId), ["modules", courseId], {
    tags: [modulesTag(courseId)],
  });

export function getCourseModules(courseId: string) {
  return cached(
    `modules:${courseId}:`,
    () => getPersistentCourseModules(courseId)(),
    COURSE_CACHE,
  );
}

/**
 * Warm both course-detail and course-content caches in the background —
 * used after a catalog load so opening a course skips the database.
 */
export function preloadCourse(courseId: string): void {
  preload(`course:${courseId}:`, () => getPersistentCourseDetail(courseId)(), COURSE_CACHE);
  preload(`modules:${courseId}:`, () => getPersistentCourseModules(courseId)(), COURSE_CACHE);
}

/**
 * Call after any write that changes a course's detail or content.
 * Drops the in-process entry AND purges the persistent Data Cache tag
 * (stale-while-revalidate, so in-flight reads finish on the old value).
 */
export function invalidateCourse(courseId: string): void {
  invalidate(`course:${courseId}:`);
  invalidate(`modules:${courseId}:`);
  try {
    revalidateTag(courseTag(courseId), "max");
    revalidateTag(modulesTag(courseId), "max");
  } catch {
    // revalidateTag throws outside a request scope (e.g. scripts) — the
    // in-process invalidation above still keeps this process correct.
  }
}

/** Call after any write that changes the published course list. */
export function invalidateCatalog(): void {
  invalidate("catalog:");
  try {
    revalidateTag(CATALOG_TAG, "max");
  } catch {
    // Outside a request scope — in-process invalidation already ran.
  }
}
