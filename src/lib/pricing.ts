// Single source of truth for offer/bundle pricing — UI and APIs must agree.
export interface PricedCourse {
  price: number;
  offerPrice: number | null;
}

/** What the buyer actually pays for a course (offer wins when valid). */
export function effectiveCoursePrice(course: PricedCourse): number {
  const base = Number.isFinite(course.price) ? course.price : 0;
  const offer =
    course.offerPrice === null || course.offerPrice === undefined
      ? null
      : course.offerPrice;
  if (offer === null || !Number.isFinite(offer)) return base;
  if (offer < 0 || offer >= base) return base;
  return offer;
}

/** Whole-percent discount for display ("25% OFF"), or 0 when no offer. */
export function discountPercent(course: PricedCourse): number {
  const base = Number.isFinite(course.price) ? course.price : 0;
  if (base <= 0) return 0;
  const effective = effectiveCoursePrice(course);
  if (effective >= base) return 0;
  return Math.round(((base - effective) / base) * 100);
}

/** Server-side guard: offer must be empty or within 0..price. */
export function isValidOffer(
  price: number,
  offerPrice: number | null | undefined,
): boolean {
  if (offerPrice === null || offerPrice === undefined) return true;
  if (!Number.isFinite(offerPrice)) return false;
  if (offerPrice < 0) return false;
  if (!Number.isFinite(price) || price < 0) return false;
  return offerPrice < price;
}

/** Sum of what each bundle course would cost bought separately. */
export function bundleMrpTotal(
  courses: PricedCourse[],
): number {
  return courses.reduce((sum, course) => {
    const base = Number.isFinite(course.price) ? course.price : 0;
    return sum + Math.max(0, base);
  }, 0);
}
