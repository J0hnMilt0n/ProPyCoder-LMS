"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LoaderCircle, Package, ShoppingCart, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { Navbar } from "@/components/navbar";
import { formatINR } from "@/lib/currency";
import {
  bundleMrpTotal,
  discountPercent,
  effectiveCoursePrice,
} from "@/lib/pricing";
import { useResource } from "@/lib/use-resource";
import { CACHE_FRESH_MS } from "@/lib/config";

// PhonePe Checkout types
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
    freshForMs: CACHE_FRESH_MS, // Always fetch fresh purchase status
    revalidateOnFocus: true,
    select: (json) => (json as { courseIds?: string[] }).courseIds ?? [],
  });
  const purchasedCourseIds = new Set(purchaseRes.data ?? []);

  // PhonePe checkout state — same SDK-owned iframe flow as /courses/[id].
  const [showIframe, setShowIframe] = useState(false);
  const [checkoutTokenUrl, setCheckoutTokenUrl] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [isPhonePeReady, setIsPhonePeReady] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const phonePeStartedRef = useRef(false);
  const phonePeHistoryEntryRef = useRef(false);
  const isClosingPhonePeFromPopStateRef = useRef(false);

  // --------------------------------------------------
  // HANDLE PHONEPE CHECKOUT CALLBACK
  // --------------------------------------------------

  const handlePhonePeCallback = useCallback(
    async (response: "USER_CANCEL" | "CONCLUDED") => {
      if (response === "USER_CANCEL") {
        const shouldGoBack = phonePeHistoryEntryRef.current;
        phonePeHistoryEntryRef.current = false;
        setShowIframe(false);
        setCheckoutTokenUrl("");
        setPaymentId(null);
        phonePeStartedRef.current = false;
        toast(
          "Payment window closed. If you completed payment, check its status before trying again.",
          {
            icon: "ℹ️",
            duration: 5000,
          },
        );
        if (shouldGoBack) {
          isClosingPhonePeFromPopStateRef.current = true;
          window.history.back();
        }
        return;
      }

      if (response !== "CONCLUDED") return;

      if (!paymentId) {
        setShowIframe(false);
        setCheckoutTokenUrl("");
        toast.error(
          "We couldn't identify this payment. Please check your payment history.",
        );
        return;
      }

      setIsVerifyingPayment(true);
      toast.loading("Verifying your payment with PhonePe...", {
        id: "phonepe-verification",
      });

      let verified = false;
      let lastMessage = "PhonePe has not confirmed the payment yet.";

      // Match the course page: retry only verification for this existing order.
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const verification = await fetch(
            `/api/payments/${encodeURIComponent(paymentId)}`,
            {
              method: "POST",
              cache: "no-store",
              signal: AbortSignal.timeout(15_000),
            },
          );
          const result = (await verification.json().catch(() => ({}))) as {
            success?: boolean;
            alreadyCompleted?: boolean;
            error?: string;
          };

          if (verification.ok && (result.success || result.alreadyCompleted)) {
            verified = true;
            break;
          }

          lastMessage = result.error ?? lastMessage;
          if (verification.status !== 409) break;
        } catch (error) {
          lastMessage =
            error instanceof Error
              ? error.message
              : "Unable to contact the payment verification service.";
        }

        if (attempt < 5) {
          await new Promise((resolve) => window.setTimeout(resolve, 1500));
        }
      }

      const shouldGoBack = phonePeHistoryEntryRef.current;
      phonePeHistoryEntryRef.current = false;
      setShowIframe(false);
      setCheckoutTokenUrl("");
      setPaymentId(null);
      phonePeStartedRef.current = false;
      if (shouldGoBack) {
        isClosingPhonePeFromPopStateRef.current = true;
        window.history.back();
      }

      toast.dismiss("phonepe-verification");
      if (verified) {
        toast.success("Payment verified. Updating your bundle access...");
      } else {
        toast.error(
          `${lastMessage} If money was debited, do not pay again; check your payment status or contact support.`,
          { duration: 7000 },
        );
      }

      // Reload the bundle page so the user-scoped purchase resource is fetched
      // again, whether the provider confirmed immediately or is still processing.
      window.location.reload();
    },
    [paymentId],
  );

  // --------------------------------------------------
  // BROWSER BACK CLOSES CHECKOUT, NOT THE BUNDLE PAGE
  // --------------------------------------------------

  const closePhonePeCheckout = useCallback((showToast: boolean) => {
    if (window.PhonePeCheckout) {
      try {
        window.PhonePeCheckout.closePage();
      } catch (error) {
        console.warn("[PhonePe] closePage failed", error);
      }
    }
    phonePeStartedRef.current = false;
    setShowIframe(false);
    setCheckoutTokenUrl("");
    setPaymentId(null);
    if (showToast) {
      toast(
        "Payment window closed. If you completed payment, check its status before trying again.",
        {
          icon: "ℹ️",
          duration: 5000,
        },
      );
    }
  }, []);

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

  // --------------------------------------------------
  // INVOKE PHONEPE SDK (THE SDK CREATES THE IFRAME)
  // --------------------------------------------------

  useEffect(() => {
    if (!showIframe || !checkoutTokenUrl || !isPhonePeReady) return;
    if (!window.PhonePeCheckout || phonePeStartedRef.current) return;

    phonePeStartedRef.current = true;
    try {
      window.PhonePeCheckout.transact({
        tokenUrl: checkoutTokenUrl,
        callback: handlePhonePeCallback,
        type: "IFRAME",
      });
    } catch (error) {
      phonePeStartedRef.current = false;
      console.error("[PhonePe] Failed to open checkout", error);
      toast.error("Unable to open PhonePe checkout. Please try again.");
      setShowIframe(false);
      setCheckoutTokenUrl("");
      setPaymentId(null);
    }

    // Do not call closePage() from effect cleanup; React may run cleanup while
    // the SDK is already tearing down its own cross-origin checkout.
    return () => {
      phonePeStartedRef.current = false;
    };
  }, [showIframe, checkoutTokenUrl, isPhonePeReady, handlePhonePeCallback]);

  const closeIframe = useCallback(() => {
    const shouldGoBack =
      phonePeHistoryEntryRef.current &&
      !isClosingPhonePeFromPopStateRef.current;
    phonePeHistoryEntryRef.current = false;
    closePhonePeCheckout(false);
    if (shouldGoBack) {
      isClosingPhonePeFromPopStateRef.current = true;
      window.history.back();
    }
  }, [closePhonePeCheckout]);

  async function buyBundle() {
    if (!bundle) return;

    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }

    if (status !== "authenticated") {
      toast.error("Please wait while your account is loading.");
      return;
    }

    if (!isPhonePeReady || !window.PhonePeCheckout) {
      toast.error(
        "PhonePe checkout is still loading. Please try again shortly.",
      );
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
        id?: string;
        error?: string;
        checkoutUrl?: string;
      };

      if (!response.ok || !data.id || !data.checkoutUrl) {
        throw new Error(data.error || "Could not start checkout");
      }

      // Keep the internal Prisma payment ID for /api/payments/[id].
      // PhonePe's merchantOrderId is used only by the server.
      setPaymentId(data.id);
      setPaymentId(data.id);
      setCheckoutTokenUrl(data.checkoutUrl);
      setShowIframe(true);
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
      (purchasedCourseIds.has(course.id) ? effectiveCoursePrice(course) : 0),
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
      <Script
        src="https://mercury.phonepe.com/web/bundle/checkout.js"
        strategy="afterInteractive"
        onReady={() => {
          const ready = Boolean(window.PhonePeCheckout);
          setIsPhonePeReady(ready);
          if (!ready) {
            console.error(
              "[PhonePe] Script loaded but checkout SDK is unavailable",
            );
            toast.error(
              "Unable to load PhonePe checkout. Please refresh and try again.",
            );
          }
        }}
        onError={() => {
          setIsPhonePeReady(false);
          console.error("[PhonePe] Failed to load checkout SDK");
          toast.error(
            "Unable to load PhonePe checkout. Please refresh and try again.",
          );
        }}
      />
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
                    prefetch={false}
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
                disabled={
                  isBuying ||
                  isVerifyingPayment ||
                  !isPhonePeReady ||
                  remainingCourses.length === 0
                }
              >
                {isBuying ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <>
                    <ShoppingCart size={15} />
                    {remainingCourses.length === 0
                      ? "All courses purchased"
                      : !isPhonePeReady
                        ? "Loading payment..."
                        : "Get this bundle"}
                  </>
                )}
              </button>
              <p className="text-xs text-gray-400 mt-3 text-center">
                Secure PhonePe checkout. Your courses unlock after payment
                verification.
              </p>
              {showIframe && (
                <button
                  type="button"
                  onClick={closeIframe}
                  className="mt-2 text-xs text-gray-500 underline hover:text-gray-700"
                >
                  Close payment window
                </button>
              )}
              {showIframe && (
                <button
                  type="button"
                  onClick={closeIframe}
                  className="mt-2 text-xs text-gray-500 underline hover:text-gray-700"
                >
                  Close payment window
                </button>
              )}
            </aside>
          </div>
        </div>
      </main>

      {/* The PhonePe SDK owns and renders its checkout iframe. */}
      {/* {showIframe && (
        <div
          className="fixed left-1/2 top-[max(12px,env(safe-area-inset-top))] z-[100000] w-[min(92vw,420px)] -translate-x-1/2 rounded-lg bg-gray-900/95 px-3 py-2 text-center text-xs text-white shadow-xl sm:text-sm"
          role="status"
          aria-live="polite"
        >
          {isPhonePeReady
            ? "PhonePe secure checkout is open. Complete or cancel the payment there."
            : "Loading secure PhonePe checkout..."}
        </div>
      )} */}

      {isVerifyingPayment && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 rounded-xl bg-white px-6 py-5 shadow-xl dark:bg-gray-900">
            <LoaderCircle className="animate-spin" size={22} />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
              Verifying your PhonePe payment...
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
