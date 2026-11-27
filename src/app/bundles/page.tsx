"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
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
import { PURCHASE_REFRESH_INTERVAL_MS } from "@/lib/config";
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

interface PhonePeCheckout {
  transact: (options: {
    tokenUrl: string;
    callback: (response: "USER_CANCEL" | "CONCLUDED") => void | Promise<void>;
    type: "IFRAME";
  }) => void;
  closePage: () => void;
}

declare global {
  interface Window {
    PhonePeCheckout?: PhonePeCheckout;
  }
}

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

const PURCHASE_REFRESH_INTERVAL = PURCHASE_REFRESH_INTERVAL_MS;

const FORCE_PURCHASE_REFRESH_KEY = (userId: string) =>
  `propycoder:force-purchase-refresh:${userId}`;

export default function BundlesPage() {
  const router = useRouter();
  const { status, data: session } = useSession();

  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Match the PhonePe SDK flow used on /courses/[id]. The SDK owns its iframe.
  const [isPhonePeReady, setIsPhonePeReady] = useState(false);
  const [showIframe, setShowIframe] = useState(false);
  const [iframeTokenUrl, setIframeTokenUrl] = useState("");
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const phonePeStartedRef = useRef(false);
  const phonePeHistoryEntryRef = useRef(false);
  const isClosingPhonePeFromPopStateRef = useRef(false);

  // Purchased course IDs grouped by bundle ID.
  const [purchasedByBundle, setPurchasedByBundle] = useState<
    Record<string, string[]>
  >({});

  // Existing public bundle cache.
  const bundlesRes = useResource<StoreBundle[]>({
    key: "bundles",
    url: "/api/bundles",
    scope: "public",
    select: (json) => (json as { bundles: StoreBundle[] }).bundles ?? [],
  });

  const bundles = useMemo(() => bundlesRes.data ?? [], [bundlesRes.data]);

  const isLoading = bundlesRes.isLoading;

  const closePhonePeCheckout = useCallback((showCancelledToast: boolean) => {
    if (window.PhonePeCheckout) {
      try {
        window.PhonePeCheckout.closePage();
      } catch (error) {
        console.warn("[PhonePe] closePage failed", error);
      }
    }

    phonePeStartedRef.current = false;
    setShowIframe(false);
    setIframeTokenUrl("");
    setActivePaymentId(null);

    if (showCancelledToast) {
      toast("Payment window closed. If you completed payment, check its status before trying again.", {
        icon: "ℹ️",
        duration: 5000,
      });
    }
  }, []);

  const handlePhonePeCallback = useCallback(
    async (response: "USER_CANCEL" | "CONCLUDED") => {
      if (response === "USER_CANCEL") {
        const shouldGoBack = phonePeHistoryEntryRef.current;
        phonePeHistoryEntryRef.current = false;
        setShowIframe(false);
        setIframeTokenUrl("");
        setActivePaymentId(null);
        phonePeStartedRef.current = false;
        toast.error("Payment was cancelled. You can try again.");
        if (shouldGoBack) {
          isClosingPhonePeFromPopStateRef.current = true;
          window.history.back();
        }
        return;
      }

      if (response !== "CONCLUDED") return;

      if (!activePaymentId) {
        setShowIframe(false);
        setIframeTokenUrl("");
        toast.error("We couldn't identify this payment. Please check your payment history before trying again.");
        return;
      }

      toast.loading("Verifying your payment with PhonePe...", {
        id: "phonepe-payment-verification",
      });

      let verified = false;
      let lastError = "PhonePe has not confirmed this payment yet.";

      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const verification = await fetch(
            `/api/payments/${encodeURIComponent(activePaymentId)}/complete`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              cache: "no-store",
              signal: AbortSignal.timeout(15_000),
            },
          );
          const result = await verification.json().catch(() => null);
          if (verification.ok) {
            verified = true;
            break;
          }
          lastError = result?.error || "PhonePe has not confirmed this payment yet.";
          if (verification.status !== 409) break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : "Unable to contact the payment verification service.";
        }

        if (attempt < 5) {
          await new Promise((resolve) => window.setTimeout(resolve, 1500));
        }
      }

      const shouldGoBack = phonePeHistoryEntryRef.current;
      phonePeHistoryEntryRef.current = false;
      setShowIframe(false);
      setIframeTokenUrl("");
      setActivePaymentId(null);
      phonePeStartedRef.current = false;
      if (shouldGoBack) {
        isClosingPhonePeFromPopStateRef.current = true;
        window.history.back();
      }

      if (verified) {
        const userId = session?.user?.id;
        if (userId) {
          localStorage.setItem(FORCE_PURCHASE_REFRESH_KEY(userId), "1");
        }
        toast.success("Payment successful! Updating your bundle access...", {
          id: "phonepe-payment-verification",
        });
        // Reload the catalog so the user-scoped purchase data is fetched fresh.
        window.location.reload();
      } else {
        toast.error(
          `${lastError} If money was debited, do not pay again; check your payment status or contact support.`,
          { id: "phonepe-payment-verification", duration: 7000 },
        );
        setBuyingId(null);
      }
    },
    [activePaymentId, session?.user?.id],
  );

  // Browser Back closes the PhonePe checkout before leaving the bundle catalog.
  useEffect(() => {
    if (!showIframe) return;

    if (!phonePeHistoryEntryRef.current) {
      window.history.pushState(
        { ...(window.history.state ?? {}), phonePeCheckout: true },
        "",
        window.location.href,
      );
      phonePeHistoryEntryRef.current = true;
    }

    const handlePopState = () => {
      if (isClosingPhonePeFromPopStateRef.current) {
        isClosingPhonePeFromPopStateRef.current = false;
        return;
      }
      phonePeHistoryEntryRef.current = false;
      closePhonePeCheckout(true);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [showIframe, closePhonePeCheckout]);

  // Invoke the SDK only once for each checkout token.
  useEffect(() => {
    if (!showIframe || !iframeTokenUrl || !isPhonePeReady) return;
    if (!window.PhonePeCheckout || phonePeStartedRef.current) return;

    phonePeStartedRef.current = true;
    try {
      window.PhonePeCheckout.transact({
        tokenUrl: iframeTokenUrl,
        callback: handlePhonePeCallback,
        type: "IFRAME",
      });
    } catch (error) {
      phonePeStartedRef.current = false;
      console.error("[PhonePe] Failed to open checkout", error);
      toast.error("Unable to open PhonePe checkout. Please try again.");
      setShowIframe(false);
      setIframeTokenUrl("");
      setActivePaymentId(null);
    }

    return () => {
      // Do not close the cross-origin SDK iframe during React effect cleanup.
      phonePeStartedRef.current = false;
    };
  }, [showIframe, iframeTokenUrl, isPhonePeReady, handlePhonePeCallback]);

  const closeIframe = useCallback(() => {
    const shouldGoBack = phonePeHistoryEntryRef.current && !isClosingPhonePeFromPopStateRef.current;
    phonePeHistoryEntryRef.current = false;
    closePhonePeCheckout(true);
    if (shouldGoBack) {
      isClosingPhonePeFromPopStateRef.current = true;
      window.history.back();
    }
  }, [closePhonePeCheckout]);

  /**
   * LOAD PURCHASED COURSES
   *
   * - Restores user-specific cached purchases immediately.
   * - Checks the server for the latest purchases.
   * - Consumes the force-refresh flag only after a successful response.
   * - Refreshes on focus, visibility change and BFCache restoration.
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
    let refreshInFlight = false;
    let lastRefreshAt = 0;

    let abortController: AbortController | null = null;

    const scope = userId;
    const forceRefreshKey = FORCE_PURCHASE_REFRESH_KEY(userId);

    // Restore cached purchases first.
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

    /**
     * Fetch the latest purchase information.
     */
    const refreshPurchasedCourses = async (force = false) => {
      const forcePending = localStorage.getItem(forceRefreshKey) === "1";

      const shouldForce = force || forcePending;
      const now = Date.now();

      // Avoid duplicate requests.
      if (refreshInFlight) return;

      // Avoid unnecessary requests within the refresh interval.
      if (!shouldForce && now - lastRefreshAt < PURCHASE_REFRESH_INTERVAL) {
        return;
      }

      refreshInFlight = true;
      lastRefreshAt = now;

      abortController = new AbortController();

      try {
        const response = await fetch("/api/bundles/purchases", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to refresh bundle purchases");
        }

        const result = (await response.json()) as BundlePurchasesResponse;

        const purchases = result.purchases ?? {};

        if (!active) return;

        const updatedPurchases: Record<string, string[]> = {};

        for (const bundle of bundles) {
          const courseIds = purchases[bundle.id] ?? [];

          updatedPurchases[bundle.id] = courseIds;

          // Update the user-specific resource cache.
          primeResourceCache(`bundle-purchases:${bundle.id}`, scope, courseIds);
        }

        // Replace the UI state with the latest server response.
        setPurchasedByBundle(updatedPurchases);

        // Clear the flag only after a successful server response.
        if (forcePending) {
          localStorage.removeItem(forceRefreshKey);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        // Keep cached purchases and retain the force flag for retry.
      } finally {
        refreshInFlight = false;
        abortController = null;
      }
    };

    // Initial server check.
    // The force flag automatically bypasses the refresh interval.
    void refreshPurchasedCourses();

    // Refresh when the user returns to the tab.
    const handleFocus = () => {
      void refreshPurchasedCourses();
    };

    // Refresh when restoring a page from the browser back-forward cache.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void refreshPurchasedCourses();
      }
    };

    // Refresh when the document becomes visible again.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshPurchasedCourses();
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;

      abortController?.abort();

      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);

      document.removeEventListener("visibilitychange", handleVisibilityChange);
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

      const description = (bundle.description ?? "").toLocaleLowerCase();

      return (
        title.includes(query) ||
        description.includes(query) ||
        bundle.courses.some((entry) =>
          (entry.course.title ?? "").toLocaleLowerCase().includes(query),
        )
      );
    });
  }, [bundles, searchQuery]);

  /**
   * CHECK IF A COURSE IS ALREADY PURCHASED
   */
  function isCoursePurchased(bundleId: string, courseId: string) {
    return purchasedByBundle[bundleId]?.includes(courseId) ?? false;
  }

  /**
   * CALCULATE BUNDLE PRICE
   */
  function calculateBundlePricing(bundle: StoreBundle): BundlePricing {
    const courses = bundle.courses.map((entry) => entry.course);

    const purchasedCourses = courses.filter((course) =>
      isCoursePurchased(bundle.id, course.id),
    );

    const remainingCourses = courses.filter(
      (course) => !isCoursePurchased(bundle.id, course.id),
    );

    const purchasedValue = purchasedCourses.reduce(
      (total, course) => total + effectiveCoursePrice(course),
      0,
    );

    const mrp = bundleMrpTotal(courses);

    const finalPrice = Math.max(0, bundle.price - purchasedValue);

    const discount = discountPercent({
      price: mrp,
      offerPrice: finalPrice > 0 && finalPrice < mrp ? finalPrice : null,
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

    if (!isPhonePeReady || !window.PhonePeCheckout) {
      toast.error("PhonePe checkout is still loading. Please try again shortly.");
      return;
    }

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
        id?: string;
        error?: string;
        checkoutUrl?: string;
      };

      if (!response.ok || !data.id || !data.checkoutUrl) {
        throw new Error(data?.error || "Could not start checkout");
      }

      // Keep the internal Prisma payment ID for /api/payments/[id]/complete.
      // PhonePe's merchantOrderId is used only by the server.
      setActivePaymentId(data.id);
      phonePeStartedRef.current = false;
      setIframeTokenUrl(data.checkoutUrl);
      setShowIframe(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setBuyingId(null);
    }
  }

  function clearSearch() {
    setSearchQuery("");
  }

  return (
    <main className="catalog-page">
      <Script
        src="https://mercury.phonepe.com/web/bundle/checkout.js"
        strategy="afterInteractive"
        onReady={() => setIsPhonePeReady(Boolean(window.PhonePeCheckout))}
        onError={() => {
          setIsPhonePeReady(false);
          toast.error("Unable to load PhonePe checkout. Please refresh and try again.");
        }}
      />
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
                Course <em>Hub.</em>
              </h1>

              <p>Grab 2 or more courses together at a reduced price.</p>
            </div>

            <div className="catalog-hero-note">
              <span>COMBO SAVINGS</span>
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
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search combos or their courses…"
                  aria-label="Search bundles"
                />

                <button type="submit" className="catalog-search-go">
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
          <div className="catalog-grid" aria-label="Loading bundles">
            {Array.from({ length: 3 }, (_, index) => (
              <div className="catalog-skeleton" key={index}>
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

            <p>Please check your connection and try again.</p>

            <button type="button" onClick={bundlesRes.refresh}>
              Retry
            </button>
          </div>
        ) : bundles.length === 0 ? (
          <div className="catalog-empty">
            <Package />

            <h2>No bundles available right now.</h2>

            <p>Check back soon — bundle deals are on the way.</p>
          </div>
        ) : (
          <>
            <div className="catalog-toolbar">
              <div className="catalog-results-label">
                Showing {visibleBundles.length} of {bundles.length}{" "}
                {bundles.length === 1 ? "combo" : "combos"}
              </div>
            </div>

            <div className="bundle-store">
              {visibleBundles.length === 0 ? (
                <div className="catalog-empty" style={{ gridColumn: "1 / -1" }}>
                  <Package />

                  <h2>No bundles match your search.</h2>

                  <p>Try a different term or clear the search box.</p>

                  <button type="button" onClick={clearSearch}>
                    Clear search
                  </button>
                </div>
              ) : (
                visibleBundles.map((bundle) => {
                  const pricing = calculateBundlePricing(bundle);

                  return (
                    <article key={bundle.id} className="bundle-store-card">
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

                            const purchased = isCoursePurchased(
                              bundle.id,
                              course.id,
                            );

                            return (
                              <li key={course.id} className="flex">
                                <span
                                  className={purchased ? "text-green-700" : ""}
                                >
                                  · {course.title}
                                </span>

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
                            onClick={() => void handleBundleAction(bundle)}
                            disabled={buyingId !== null || status === "loading" || !isPhonePeReady}
                          >
                            {buyingId === bundle.id ? (
                              <LoaderCircle
                                size={15}
                                className="animate-spin"
                              />
                            ) : pricing.remainingCount === 0 ? (
                              "All purchased"
                            ) : !isPhonePeReady ? (
                              "Loading payment..."
                            ) : (
                              <>
                                <ShoppingCart size={14} />
                                Get combo
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

      {/* PhonePe Checkout SDK owns and renders its checkout UI. Do not add a second iframe. */}
      {showIframe && (
        <div
          className="fixed left-1/2 top-[max(12px,env(safe-area-inset-top))] z-[100000] w-[min(92vw,420px)] -translate-x-1/2 rounded-lg bg-gray-900/95 px-3 py-2 text-center text-xs text-white shadow-xl sm:text-sm"
          role="status"
          aria-live="polite"
        >
          {isPhonePeReady
            ? "PhonePe secure checkout is open. Complete or cancel the payment there."
            : "Loading secure PhonePe checkout..."}
          <button type="button" onClick={closeIframe} className="ml-3 underline">
            Close
          </button>
        </div>
      )}
    </main>
  );
}
