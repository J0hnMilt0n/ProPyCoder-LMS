"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowRight,
  LoaderCircle,
  Package,
  Search,
  ShoppingCart,
} from "lucide-react";
import toast from "react-hot-toast";

import { Navbar } from "@/components/navbar";
import { formatINR } from "@/lib/currency";
import {
  bundleMrpTotal,
  discountPercent,
  effectiveCoursePrice,
} from "@/lib/pricing";
import {
  primeResourceCache,
  readResourceCache,
  useResource,
} from "@/lib/use-resource";

interface BundleCourse {
  id: string;
  title: string;
  price: number;
  offerPrice: number | null;
}

interface StoreBundle {
  id: string;
  title: string;
  description: string;
  image: string | null;
  price: number;
  courses: {
    course: BundleCourse;
  }[];
}

interface BundlePurchasesResponse {
  purchases?: Record<string, string[]>;
}

interface BundlePricing {
  mrp: number;
  finalPrice: number;
  discount: number;
  remainingCount: number;
}

const PURCHASE_REFRESH_INTERVAL = 30_000;

export default function BundlesPage() {
  const router = useRouter();
  const { status, data: session } = useSession();

  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // User-specific purchased course IDs grouped by bundle ID.
  const [purchasedByBundle, setPurchasedByBundle] = useState<
    Record<string, string[]>
  >({});

  const purchasedRefreshInFlightRef = useRef(false);
  const lastPurchasedRefreshRef = useRef(0);

  // Existing public bundle cache.
  const bundlesRes = useResource<StoreBundle[]>({
    key: "bundles",
    url: "/api/bundles",
    scope: "public",
    select: (json) =>
      (json as { bundles: StoreBundle[] }).bundles ?? [],
  });

  const bundles = useMemo(() => bundlesRes.data ?? [], [bundlesRes.data]);
  const isLoading = bundlesRes.isLoading;

  

  /**
   * LOAD PURCHASED COURSES FOR EACH BUNDLE
   *
   * Uses the same API endpoint and cache-key convention
   * as the individual bundle detail page.
   *
   * Cache scope is user-specific.
   */
  useEffect(() => {
    const userId = session?.user?.id;

    if (status === "loading") return;

    if (status !== "authenticated" || !userId) {
      setPurchasedByBundle({});
      return;
    }

    if (bundles.length === 0) return;

    let active = true;
    const scope = userId;

    // Restore cached purchase information immediately.
    const cachedPurchases: Record<string, string[]> = {};

    for (const bundle of bundles) {
      const cached = readResourceCache<string[]>(
        `bundle-purchases:${bundle.id}`,
        scope,
      );

      if (cached) {
        cachedPurchases[bundle.id] = cached;
      }
    }

    setPurchasedByBundle((previous) => ({
      ...previous,
      ...cachedPurchases,
    }));

    const refreshPurchasedCourses = async (force = false) => {
      const now = Date.now();

      if (purchasedRefreshInFlightRef.current) return;

      if (
        !force &&
        now - lastPurchasedRefreshRef.current <
          PURCHASE_REFRESH_INTERVAL
      ) {
        return;
      }

      purchasedRefreshInFlightRef.current = true;
      lastPurchasedRefreshRef.current = now;

      try {
        const response = await fetch("/api/bundles/purchases", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) return;
        const result =
          (await response.json()) as BundlePurchasesResponse;
        const purchases = result.purchases ?? {};

        if (!active) return;

        for (const bundle of bundles) {
          primeResourceCache(
            `bundle-purchases:${bundle.id}`,
            scope,
            purchases[bundle.id] ?? [],
          );
        }

        setPurchasedByBundle((previous) => {
          return { ...previous, ...purchases };
        });
      } catch {
        // Keep any previously cached purchase badges when refresh fails.
      } finally {
        purchasedRefreshInFlightRef.current = false;
      }
    };

    void refreshPurchasedCourses(true);

    const handleFocus = () => {
      void refreshPurchasedCourses();
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void refreshPurchasedCourses();
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      active = false;

      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [bundles, session?.user?.id, status]);

  /**
   * INSTANT CLIENT-SIDE SEARCH
   */
  const visibleBundles = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();

    if (!query) return bundles;

    return bundles.filter((bundle) => {
      const title = (bundle.title ?? "").toLocaleLowerCase();

      const description = (
        bundle.description ?? ""
      ).toLocaleLowerCase();

      return (
        title.includes(query) ||
        description.includes(query) ||
        bundle.courses.some((entry) =>
          (entry.course.title ?? "")
            .toLocaleLowerCase()
            .includes(query),
        )
      );
    });
  }, [bundles, searchQuery]);

  /**
   * CHECK IF A COURSE IS ALREADY PURCHASED
   */
  function isCoursePurchased(
    bundleId: string,
    courseId: string,
  ) {
    return (
      purchasedByBundle[bundleId]?.includes(courseId) ?? false
    );
  }

  /**
   * CALCULATE BUNDLE PRICE
   *
   * Matches the calculation used in BundleDetailPage.
   */
  function calculateBundlePricing(
    bundle: StoreBundle,
  ): BundlePricing {
    const courses = bundle.courses.map(
      (entry) => entry.course,
    );

    const purchasedCourses = courses.filter((course) =>
      isCoursePurchased(bundle.id, course.id),
    );

    const remainingCourses = courses.filter(
      (course) =>
        !isCoursePurchased(bundle.id, course.id),
    );

    const purchasedValue = purchasedCourses.reduce(
      (total, course) =>
        total + effectiveCoursePrice(course),
      0,
    );

    const mrp = bundleMrpTotal(courses);

    const finalPrice = Math.max(
      0,
      bundle.price - purchasedValue,
    );

    const discount = discountPercent({
      price: mrp,
      offerPrice:
        finalPrice > 0 && finalPrice < mrp
          ? finalPrice
          : null,
    });

    return {
      mrp,
      finalPrice,
      discount,
      remainingCount: remainingCourses.length,
    };
  }
/**
   * HANDLE BUNDLE BUTTON
   *
   * All courses purchased -> View bundle.
   * Remaining courses -> Get bundle.
   */
  function handleBundleAction(bundle: StoreBundle) {
    const pricing = calculateBundlePricing(bundle);

    if (pricing.remainingCount === 0) {
      router.push(`/bundles/${bundle.id}`);
      return;
    }

    void buyBundle(bundle);
  }
  /**
   * CHECKOUT
   */
  async function buyBundle(bundle: StoreBundle) {
    if (status === "loading") return;

    if (status !== "authenticated") {
      router.push("/auth/login");
      return;
    }

    if (buyingId !== null) return;

    const pricing = calculateBundlePricing(bundle);

    if (pricing.remainingCount === 0) {
      toast.success("You already own every course in this bundle.");
      return;
    }

    setBuyingId(bundle.id);

    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          bundleId: bundle.id,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        checkoutUrl?: string;
      };

      if (!response.ok || !data.checkoutUrl) {
        throw new Error(
          data?.error || "Could not start checkout",
        );
      }

      router.push(data.checkoutUrl);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Checkout failed",
      );
    } finally {
      setBuyingId(null);
    }
  }

  function clearSearch() {
    setSearchQuery("");
  }

  return (
    <main className="catalog-page">
      <Navbar />

      {/* HERO */}
      <header className="catalog-hero">
        <div className="catalog-hero-inner">
          <div className="catalog-eyebrow">
            <Package size={14} />
            LEARN MORE, PAY LESS
          </div>

          <div className="catalog-hero-row">
            <div>
              <h1>
                Course <em>bundles.</em>
              </h1>

              <p>
                Grab 2 or more courses together at a reduced price.
              </p>
            </div>

            <div className="catalog-hero-note">
              <span>BUNDLE SAVINGS</span>
              <strong>More courses, one price.</strong>
            </div>

            <form
              className="catalog-hero-search"
              role="search"
              onSubmit={(event) => event.preventDefault()}
            >
              <div className="catalog-searchbar">
                <Search size={17} />

                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) =>
                    setSearchQuery(event.target.value)
                  }
                  placeholder="Search bundles or their courses…"
                  aria-label="Search bundles"
                />
                <button
                  type="submit"
                  className="catalog-search-go"
                >
                  Search
                </button>
              </div>
            </form>
          </div>
        </div>
      </header>

      {/* BUNDLE CATALOG */}
      <section className="catalog-content">
        {isLoading ? (
          <div
            className="catalog-grid"
            aria-label="Loading bundles"
          >
            {Array.from({ length: 3 }, (_, index) => (
              <div
                className="catalog-skeleton"
                key={index}
              >
                <span />
                <div />
                <div />
              </div>
            ))}
          </div>
        ) : bundlesRes.error && bundles.length === 0 ? (
          <div className="catalog-empty">
            <Package />

            <h2>Unable to load bundles.</h2>

            <p>
              Please check your connection and try again.
            </p>

            <button
              type="button"
              onClick={bundlesRes.refresh}
            >
              Retry
            </button>
          </div>
        ) : bundles.length === 0 ? (
          <div className="catalog-empty">
            <Package />

            <h2>No bundles available right now.</h2>

            <p>
              Check back soon — bundle deals are on the way.
            </p>
          </div>
        ) : (
          <>
            <div className="catalog-toolbar">
              <div className="catalog-results-label">
                Showing {visibleBundles.length} of{" "}
                {bundles.length}{" "}
                {bundles.length === 1 ? "bundle" : "bundles"}
              </div>
            </div>

            <div className="bundle-store">
              {visibleBundles.length === 0 ? (
                <div
                  className="catalog-empty"
                  style={{ gridColumn: "1 / -1" }}
                >
                  <Package />

                  <h2>No bundles match your search.</h2>

                  <p>
                    Try a different term or clear the search box.
                  </p>

                  <button
                    type="button"
                    onClick={clearSearch}
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                visibleBundles.map((bundle) => {
                  const pricing =
                    calculateBundlePricing(bundle);

                  return (
                    <article
                      key={bundle.id}
                      className="bundle-store-card"
                    >
                      {/* COVER */}
                      <Link
                        href={`/bundles/${bundle.id}`}
                        prefetch={false}
                        className="bundle-store-cover"
                        aria-label={`View ${bundle.title}`}
                      >
                        {bundle.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={bundle.image ?? undefined}
                            alt={bundle.title}
                            loading="lazy"
                          />
                        ) : (
                          <Package size={44} />
                        )}
                      </Link>

                      {/* BODY */}
                      <div className="bundle-store-body">
                        <h3>
                          <Link
                            href={`/bundles/${bundle.id}`}
                            prefetch={false}
                            className="bundle-store-title"
                          >
                            {bundle.title}
                          </Link>
                        </h3>

                        <p>{bundle.description}</p>

                        {/* INCLUDED COURSES */}
                        <ul className="bundle-store-courses">
                          {bundle.courses.map((entry) => {
                            const course = entry.course;

                            const purchased =
                              isCoursePurchased(
                                bundle.id,
                                course.id,
                              );

                            return (
                              <li key={course.id} className="flex">
                                <span className={purchased ? "text-green-700": ""}>· {course.title}</span>

                                {purchased && (
                                  <span className="purchased-pill ml-auto">
                                    Purchased
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>

                        {/* PRICING */}
                        <div className="bundle-store-foot">
                          <div className="bundle-pricing">
                            <span className="bundle-mrp">
                              {formatINR(pricing.mrp)}
                            </span>

                            <strong className="bundle-price">
                              {formatINR(pricing.finalPrice)}
                            </strong>

                            {pricing.discount > 0 && (
                              <span className="price-tag-badge">
                                {pricing.discount}% OFF
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            className="bundle-buy cursor-pointer"
                            onClick={() =>
                              void handleBundleAction(bundle)
                            }
                            disabled={
                              buyingId !== null ||
                              status === "loading"                    
                            }
                          >
                            {buyingId === bundle.id ? (
                              <LoaderCircle
                                size={15}
                                className="animate-spin"
                              />
                            ) : pricing.remainingCount === 0 ? (
                              "All purchased"
                            ) : (
                              <>
                                <ShoppingCart size={14} />
                                Get bundle
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </>
        )}
      </section>

      {/* FOOTER */}
      <footer className="catalog-footer">
        <span>PROPYCODER LEARNING</span>

        <span>Build the skill. Build the thing.</span>

        <Link href="/courses">
          Browse all courses
          <ArrowRight size={14} />
        </Link>
      </footer>
    </main>
  );
}