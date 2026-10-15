import { revalidateTag, unstable_cache } from "next/cache";
import { cached, invalidate, type CacheOptions } from "@/lib/data-cache";

/**
 * App-wide read caching for the pages that load data from the server,
 * layered on the remote database. Mirrors course-cache.ts:
 *
 *  - GLOBAL payloads (identical for everyone who can see them — the admin
 *    dashboard, public bundles + a bundle by id, public announcements, the
 *    marketing home page, a certificate by id) also use Next.js' persistent
 *    Data Cache (unstable_cache). That layer is shared across server
 *    instances and survives restarts, and is purged on demand via
 *    revalidateTag the moment a write changes it (stale-while-revalidate).
 *
 *  - PER-USER payloads (a user's enrollments, notifications, progress,
 *    certificates, profile, an instructor's own courses, my live classes)
 *    use ONLY the in-process cache, keyed by user id, with precise
 *    invalidation on the writes that change them. They are deliberately kept
 *    out of the shared persistent cache so one user's data can never be
 *    served to another.
 *
 * Every read is served instantly from the in-process layer; a stale value is
 * returned while a single deduplicated background refresh runs, so pages
 * stop blocking on the remote database.
 */

/** Global payload windows — writes purge the tag, so a longer fresh window is safe. */
export const GLOBAL_CACHE: CacheOptions = { freshMs: 30_000, staleMs: 60_000 };
/**
 * Per-user payloads change more dynamically (progress, unread badges) and can
 * be affected by another actor (an admin broadcast), so keep the window short
 * and rely on precise invalidation for correctness.
 */
export const USER_CACHE: CacheOptions = { freshMs: 15_000, staleMs: 30_000 };
/** Live classes: scheduled events — short window, and status is always recomputed per request. */
export const LIVE_CACHE: CacheOptions = { freshMs: 15_000, staleMs: 30_000 };

// ---- persistent (shared) Data Cache tags ----
export const ADMIN_OVERVIEW_TAG = "admin-overview";
export const BUNDLES_TAG = "bundles";
export const ANNOUNCEMENTS_TAG = "announcements";
export const HOME_TAG = "home";
export const CERTIFICATE_TAG = "certificates";

/** Per-user cache namespaces (in-process only). */
export const NS = {
  enrollments: "enrollments",
  notifications: "notifications",
  progress: "progress",
  certificates: "certificates-list",
  profile: "profile",
  instructorCourses: "instructor-courses",
  liveClasses: "live-classes",
} as const;

function purgeTag(tag: string): void {
  try {
    revalidateTag(tag, "max");
  } catch {
    // Outside a request scope — the in-process invalidation already ran.
  }
}

/** Wrap a GLOBAL loader in the persistent Data Cache with an in-process front. */
function globalCached<T>(
  key: string,
  keyParts: string[],
  tag: string,
  load: () => Promise<T>,
  opts: CacheOptions = GLOBAL_CACHE,
): Promise<T> {
  const persistent = unstable_cache(load, keyParts, { tags: [tag] });
  return cached(key, () => persistent(), opts);
}

/* ------------------------------ global reads ------------------------------ */

export function getAdminOverview<T>(load: () => Promise<T>): Promise<T> {
  return globalCached("admin-overview:", ["admin-overview"], ADMIN_OVERVIEW_TAG, load);
}

export function getBundles<T>(load: () => Promise<T>): Promise<T> {
  return globalCached("bundles:list:", ["bundles", "list"], BUNDLES_TAG, load);
}

export function getAdminBundles<T>(load: () => Promise<T>): Promise<T> {
  return globalCached("bundles:admin:", ["bundles", "admin"], BUNDLES_TAG, load);
}

export function getBundle<T>(id: string, load: () => Promise<T>): Promise<T> {
  return globalCached(`bundles:detail:${id}:`, ["bundle", id], BUNDLES_TAG, load);
}

export function getAnnouncements<T>(load: () => Promise<T>): Promise<T> {
  return globalCached("announcements:list:", ["announcements"], ANNOUNCEMENTS_TAG, load);
}

export function getHomeData<T>(load: () => Promise<T>): Promise<T> {
  return globalCached("home:", ["home"], HOME_TAG, load);
}

/** Certificates are immutable once issued, so this never needs invalidation. */
export function getCertificateDetail<T>(id: string, load: () => Promise<T>): Promise<T> {
  return globalCached(`certificate:${id}:`, ["certificate", id], CERTIFICATE_TAG, load);
}

/* ---------------------------- global invalidation -------------------------- */

export function invalidateAdminOverview(): void {
  invalidate("admin-overview:");
  purgeTag(ADMIN_OVERVIEW_TAG);
}

export function invalidateBundles(): void {
  invalidate("bundles:");
  purgeTag(BUNDLES_TAG);
}

export function invalidateAnnouncements(): void {
  invalidate("announcements:");
  purgeTag(ANNOUNCEMENTS_TAG);
}

export function invalidateHome(): void {
  invalidate("home:");
  purgeTag(HOME_TAG);
}

/* ------------------------------ per-user reads ----------------------------- */

/**
 * Cache a per-user payload in-process, keyed by `namespace:userId[:suffix]`.
 * The optional `suffix` (e.g. a courseId) scopes the entry; invalidating the
 * user's namespace drops every suffix for that user.
 */
export function userCached<T>(
  ns: string,
  userId: string,
  load: () => Promise<T>,
  opts: CacheOptions = USER_CACHE,
  suffix?: string,
): Promise<T> {
  return cached(`${ns}:${userId}:${suffix ?? ""}`, load, opts);
}

/** Drop one user's entries in a namespace (all suffixes). */
export function invalidateUser(ns: string, userId: string): void {
  invalidate(`${ns}:${userId}:`);
}

/** Drop EVERY user's entries in a namespace (broadcasts that touch all users). */
export function invalidateUserNamespace(ns: string): void {
  invalidate(`${ns}:`);
}
