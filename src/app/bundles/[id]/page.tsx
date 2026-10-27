"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LoaderCircle, Package, ShoppingCart, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { Navbar } from "@/components/navbar";
import { formatINR } from "@/lib/currency";
import { bundleMrpTotal, discountPercent, effectiveCoursePrice } from "@/lib/pricing";
import { useResource } from "@/lib/use-resource";

interface DetailBundle {
  id: string;
  title: string;
  description: string;
  image: string | null;
  price: number;
  courses: {
    course: {
      id: string;
      title: string;
      description: string | null;
      price: number;
      offerPrice: number | null;
      image: string | null;
      category: string | null;
      level: string | null;
      duration: number | null;
      instructor: { firstName: string; lastName: string } | null;
    };
  }[];
}

export default function BundleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();
  const bundleRes = useResource<DetailBundle>({
    key: `bundle-detail:${id}`,
    url: `/api/bundles/${id}`,
    scope: "public",
    enabled: Boolean(id),
    select: (json) => (json as { bundle: DetailBundle }).bundle,
  });
  const bundle = bundleRes.data;
  const isLoading = bundleRes.isLoading;
  const [isBuying, setIsBuying] = useState(false);
  const purchaseRes = useResource<string[]>({
    key: `bundle-purchases:${id}`,
    url: `/api/bundles/${id}/purchases`,
    scope: session?.user?.id ?? "",
    enabled: Boolean(id) && status === "authenticated",
    select: (json) => (json as { courseIds?: string[] }).courseIds ?? [],
  });
  const purchasedCourseIds = new Set(purchaseRes.data ?? []);

  async function buyBundle() {
    if (!bundle) return;
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    setIsBuying(true);
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId: bundle.id }),
      });
      const data = (await response.json()) as {
        error?: string;
        checkoutUrl?: string;
      };
      if (!response.ok || !data.checkoutUrl)
        throw new Error(data?.error || "Could not start checkout");
      router.push(data.checkoutUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setIsBuying(false);
    }
  }

  if (isLoading) {
    return (
      <div className="auth-page">
        <Navbar />
        <main className="auth-layout bundle-layout">
          <div className="auth-content bundle-content auth-loading">
            <LoaderCircle size={28} className="animate-spin" />
            <p>Loading bundle…</p>
          </div>
        </main>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="auth-page">
        <Navbar />
        <main className="auth-layout bundle-layout">
          <div className="auth-content bundle-content">
            <div className="auth-card auth-empty">
              <Package size={34} />
              <h2>Bundle not found</h2>
              <p>It may have been removed by the store admins.</p>
              <Link href="/bundles" className="auth-submit">
                Back to bundles
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const courses = bundle.courses.map((entry) => entry.course);
  const remainingCourses = courses.filter(
    (course) => !purchasedCourseIds.has(course.id),
  );
  const purchasedValue = courses.reduce(
    (total, course) =>
      total +
      (purchasedCourseIds.has(course.id)
        ? effectiveCoursePrice(course)
        : 0),
    0,
  );
  const bundlePrice = Math.max(0, bundle.price - purchasedValue);
  const mrp = bundleMrpTotal(courses);
  const purchaseCredit = Math.min(bundle.price, purchasedValue);
  const off = discountPercent({
    price: mrp,
    offerPrice: bundlePrice > 0 && bundlePrice < mrp ? bundlePrice : null,
  });

  return (
    <div className="auth-page">
      <Navbar />
      <main className="auth-layout bundle-layout">
        <div className="auth-content bundle-content">
          <Link href="/bundles" className="bundle-back">
            <ArrowLeft size={15} /> All bundles
          </Link>
          <section className="auth-hero">
            <span className="auth-eyebrow">BUNDLE DEAL</span>
            <h1>{bundle.title}</h1>
            <p>{bundle.description}</p>
          </section>

          <div className="bundle-detail-grid">
            <ul className="bundle-detail-list">
              {courses.map((course) => (
                <li key={course.id} className="bundle-detail-item">
                  <Link
                    href={`/courses/${course.id}`}
                    className="bundle-detail-link"
                    aria-label={`Open ${course.title}`}
                  >
                    {course.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={course.image} alt={course.title} />
                    ) : (
                      <div className="bundle-store-cover">
                        <Package size={22} />
                      </div>
                    )}
                    <div className="bundle-detail-copy">
                      <h3>{course.title}</h3>
                      <p>
                        {course.category} · {course.level}
                        {course.instructor &&
                          ` · by ${course.instructor.firstName} ${course.instructor.lastName}`}
                      </p>
                    </div>
                    {purchasedCourseIds.has(course.id) ? (
                      <span className="purchased-pill">Purchased</span>
                    ) : (
                      <span className="bundle-mrp">
                        {course.offerPrice !== null &&
                        effectiveCoursePrice(course) < course.price ? (
                          <>
                            <del>{formatINR(course.price)}</del>{" "}
                            {/* <strong>{formatINR(effectiveCoursePrice(course))}</strong> */}
                          </>
                        ) : (
                          formatINR(course.price)
                        )}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>

            <aside className="bundle-buy-card flex flex-col items-center">
              <div className="bundle-purchase-breakdown">
                <div className="bundle-purchase-row">
                  <span>Original course prices</span>
                  <span>{formatINR(mrp)}</span>
                </div>
                {/* <div className="bundle-purchase-row">
                  <span>Course offer prices</span>
                  <span>{formatINR(courseOfferTotal)}</span>
                </div> */}
                <div className="bundle-purchase-row">
                  <span>Bundle offer</span>
                  <span>{formatINR(bundle.price)}</span>
                </div>
                {/* {courseSavings > 0 && (
                  <div className="bundle-purchase-row is-credit">
                    <span>Course offer savings</span>
                    <span>− {formatINR(courseSavings)}</span>
                  </div>
                )} */}
                {purchaseCredit > 0 && (
                  <div className="bundle-purchase-row is-credit">
                    <span>Purchased</span>
                    <span>− {formatINR(purchaseCredit)}</span>
                  </div>
                )}
                <div className="bundle-purchase-total">
                  <span>You pay</span>
                  <strong>{formatINR(bundlePrice)}</strong>
                </div>
                {off > 0 && <span className="price-tag-badge">{off}% OFF</span>}
              </div>
              <p className="text-sm text-gray-600 mb-4">
                {remainingCourses.length === 0
                  ? "You already own every course in this bundle."
                  : purchaseCredit > 0
                    ? `${formatINR(purchaseCredit)} has been deducted because you already purchased ${courses.filter((course) => purchasedCourseIds.has(course.id)).length} course${courses.filter((course) => purchasedCourseIds.has(course.id)).length === 1 ? "" : "s"}.`
                    : `${remainingCourses.length} course${remainingCourses.length === 1 ? "" : "s"} included in one payment.`}
              </p>
              <button
                className="bundle-buy w-50 flex justify-center"
                onClick={() => void buyBundle()}
                disabled={isBuying || remainingCourses.length === 0}
              >
                {isBuying ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <>
                    <ShoppingCart size={15} />
                    {remainingCourses.length === 0 ? "All courses purchased" : "Get this bundle"}
                  </>
                )}
              </button>
              <p className="text-xs text-gray-400 mt-3 text-center">
                Demo checkout — enrolls you in every course instantly after
                payment.
              </p>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

