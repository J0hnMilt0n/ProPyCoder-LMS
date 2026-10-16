// Shared course-slug helper: the course id doubles as the URL slug
// (/courses/<id>), so creation forms let authors pick a readable one
// instead of the auto-generated cuid. Slugs are permanent once set:
// changing an id later would orphan enrollments, payments and caches.

/** Max slug length kept in the URL. */
export const MAX_SLUG_LENGTH = 60;

/** Characters a course slug may contain. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Turn a course title into a URL-safe slug: lowercase, diacritics
 * stripped, runs of other characters collapsed to a single hyphen.
 * Returns "" when nothing usable remains (callers fall back to cuid).
 */
export function slugify(title: string): string {
  const withoutDiacritics = Array.from(title.normalize("NFKD"))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x300 || code > 0x36f;
    })
    .join("");
  const slug = withoutDiacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return slug;
}
