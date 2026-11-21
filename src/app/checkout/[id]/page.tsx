
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { formatINR } from "@/lib/currency";
import {
  ArrowLeft,
  Lock,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import toast from "react-hot-toast";

const REQUEST_TIMEOUT_MS = 15_000;

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
  checkoutUrl?: string | null;
  course: {
    id: string;
    title: string;
    category: string | null;
    image: string | null;
  } | null;
  bundle?: {
    id: string;
    title: string;
    image: string | null;
    courses: {
      course: {
        id: string;
        title: string;
      };
    }[];
  } | null;
}

interface Props {
  params: Promise<{ id: string }>;
}

export default function CheckoutPage({ params }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  const [paymentId, setPaymentId] = useState("");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);

  // Prevent repeated verification requests for the same payment.
  const verificationStartedFor = useRef<string | null>(null);

  const FORCE_PURCHASE_REFRESH_KEY = (userId: string) =>
    `propycoder:force-purchase-refresh:${userId}`;

  const isPhonePeReturn =
    searchParams.get("phonepe") === "return";

  const isVerifying = isLoading || isPaying;

  // --------------------------------------------------
  // GET PAYMENT ID
  // --------------------------------------------------

  useEffect(() => {
    let active = true;

    params.then(({ id }) => {
      if (active) {
        setPaymentId(id);
      }
    });

    return () => {
      active = false;
    };
  }, [params]);

  // --------------------------------------------------
  // REDIRECT AFTER SUCCESS
  // --------------------------------------------------

  const redirectAfterSuccess = useCallback(
    (data: Payment) => {
      toast.success("Payment successful! Your access is ready.");

      if (data.bundle) {
        if (session?.user?.id) {
          localStorage.setItem(
            FORCE_PURCHASE_REFRESH_KEY(session.user.id),
            "1"
          );
        }

        router.replace(`/bundles/${data.bundle.id}`);
        return;
      }

      if (data.course) {
        if (session?.user?.id) {
          localStorage.setItem(
            FORCE_PURCHASE_REFRESH_KEY(session.user.id),
            "1"
          );
        }

        router.replace(`/courses/${data.course.id}`);
        return;
      }

      router.replace("/dashboard");
    },
    [router, session?.user?.id]
  );

  // --------------------------------------------------
  // LOAD PAYMENT
  // --------------------------------------------------

  const loadPayment = useCallback(async () => {
    if (!paymentId) return;

    try {
      const response = await fetch(
        `/api/payments/${paymentId}/complete`,
        {
          method: "GET",
          cache: "no-store",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );

      if (!response.ok) {
        throw new Error("Payment not found");
      }

      const data = (await response.json()) as Payment;

      setPayment(data);

      if (data.status === "COMPLETED") {
        redirectAfterSuccess(data);
      }
    } catch (error) {
      console.error("[Checkout] Load payment error:", error);

      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load checkout"
      );

      router.push("/courses");
    } finally {
      setIsLoading(false);
    }
  }, [paymentId, redirectAfterSuccess, router]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }

    if (status === "authenticated" && paymentId) {
      void loadPayment();
    }
  }, [status, paymentId, loadPayment, router]);

  // --------------------------------------------------
  // VERIFY PHONEPE PAYMENT AFTER RETURN
  // --------------------------------------------------

  useEffect(() => {
    if (
      !isPhonePeReturn ||
      status !== "authenticated" ||
      !payment ||
      payment.status !== "PENDING" ||
      isPaying
    ) {
      return;
    }

    // Do not verify the same payment repeatedly.
    if (verificationStartedFor.current === payment.id) {
      return;
    }

    verificationStartedFor.current = payment.id;

    let cancelled = false;

    const verifyPayment = async () => {
      setIsPaying(true);

      try {
        const response = await fetch(
          `/api/payments/${payment.id}/complete`,
          {
            method: "POST",
            cache: "no-store",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          }
        );

        const data = await response.json().catch(() => null);

        if (cancelled) return;

        if (response.ok) {
          redirectAfterSuccess(payment);
          return;
        }

        toast(
          data?.error ||
            "Payment is not confirmed yet. Please try again shortly."
        );

        await loadPayment();
      } catch (error) {
        if (!cancelled) {
          console.error("[Checkout] Verification error:", error);

          toast.error(
            "Could not verify payment yet. Please check again shortly."
          );
        }
      } finally {
        if (!cancelled) {
          setIsPaying(false);
        }
      }
    };

    void verifyPayment();

    return () => {
      cancelled = true;
    };
  }, [
    isPhonePeReturn,
    status,
    payment,
    isPaying,
    redirectAfterSuccess,
    loadPayment,
  ]);

  // --------------------------------------------------
  // CONTINUE TO EXISTING PHONEPE CHECKOUT
  // --------------------------------------------------

  const continueToPhonePe = () => {
    if (
      !payment ||
      payment.status !== "PENDING" ||
      isPaying
    ) {
      return;
    }

    if (!payment.checkoutUrl) {
      toast.error(
        "The existing checkout session is unavailable. Please contact support before creating another payment."
      );
      return;
    }

    window.location.assign(payment.checkoutUrl);
  };

  // --------------------------------------------------
  // LOADING / VERIFICATION SCREEN
  // --------------------------------------------------

  if (isVerifying || status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#08080a]">
        <Navbar />

        <main className="flex min-h-[75vh] items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-[#232329] dark:bg-[#0c0c0e]">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 dark:bg-orange-500/10">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#e95f32]/20 border-t-[#e95f32]" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {isPaying
                ? "Verifying your payment"
                : "Loading checkout"}
            </h1>

            <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-[#a7a5ae]">
              We're securely confirming your transaction with PhonePe.
              Please wait while we complete your enrollment.
            </p>

            <div className="mt-7 rounded-xl bg-orange-50 p-4 dark:bg-orange-500/10">
              <p className="text-sm font-semibold text-[#e95f32]">
                Please don't close or refresh this page.
              </p>

              <p className="mt-1 text-xs text-gray-600 dark:text-[#a7a5ae]">
                Avoid pressing the browser Back button until verification
                is complete.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400">
              <ShieldCheck className="h-4 w-4" />
              Secure payment verification
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --------------------------------------------------
  // CHECKOUT NOT FOUND
  // --------------------------------------------------

  if (!payment) {
    return (
      <div className="min-h-screen bg-gray-50 check-out-page">
        <Navbar />

        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <p className="text-gray-600 dark:text-[#a7a5ae]">
            Checkout not found.
          </p>

          <button
            onClick={() => router.push("/courses")}
            className="mt-4 font-semibold text-[#e95f32]"
          >
            Back to courses
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // PAYMENT FAILED / REFUNDED
  // --------------------------------------------------

  if (
    payment.status === "FAILED" ||
    payment.status === "REFUNDED"
  ) {
    return (
      <div className="min-h-screen bg-gray-50 check-out-page dark:bg-[#08080a]">
        <Navbar />

        <main className="mx-auto max-w-xl px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {payment.status === "REFUNDED"
              ? "Payment refunded"
              : "Payment failed"}
          </h1>

          <p className="mt-3 text-sm text-gray-600 dark:text-[#a7a5ae]">
            {payment.status === "REFUNDED"
              ? "This payment has been refunded."
              : "This payment was not completed. Please return to the course page to start a new payment."}
          </p>

          <button
            onClick={() => router.push(
              payment.course
                ? `/courses/${payment.course.id}`
                : payment.bundle
                  ? `/bundles/${payment.bundle.id}`
                  : "/courses"
            )}
            className="mt-6 rounded-lg bg-[#e95f32] px-6 py-3 font-semibold text-white hover:bg-[#d9532a]"
          >
            Back to course
          </button>
        </main>
      </div>
    );
  }

  // --------------------------------------------------
  // CHECKOUT PAGE
  // --------------------------------------------------

  const title =
    payment.bundle?.title ??
    payment.course?.title ??
    "Order";

  return (
    <div className="min-h-screen bg-gray-50 check-out-page dark:bg-[#08080a]">
      <Navbar />

      <main className="mx-auto max-w-5xl px-4 py-10">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 dark:text-[#a7a5ae]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-[#f1f0f2]">
          Checkout
        </h1>

        <div className="grid gap-6 md:grid-cols-[1fr_380px]">
          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-[#232329] dark:bg-[#0c0c0e]">
            <div className="flex items-center gap-3">
              <Smartphone className="h-6 w-6 text-[#e95f32]" />

              <div>
                <h2 className="font-semibold text-gray-900 dark:text-[#f1f0f2]">
                  Secure PhonePe checkout
                </h2>

                <p className="text-sm text-gray-600 dark:text-[#a7a5ae]">
                  UPI, cards and net banking are handled securely by
                  PhonePe.
                </p>
              </div>
            </div>

            {isPhonePeReturn && payment.status === "PENDING" && (
              <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">
                Your payment has not yet been confirmed. You can reopen
                the existing PhonePe checkout below.
              </p>
            )}

            {!payment.checkoutUrl && payment.status === "PENDING" && (
              <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                The saved checkout session is unavailable. Please contact
                support before attempting another payment.
              </p>
            )}

            <button
              type="button"
              onClick={continueToPhonePe}
              disabled={
                isPaying ||
                payment.status !== "PENDING" ||
                !payment.checkoutUrl
              }
              className="mt-6 w-full rounded-lg bg-[#e95f32] px-4 py-3 font-semibold text-white hover:bg-[#d9532a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPaying
                ? "Verifying payment…"
                : payment.status === "PENDING"
                  ? "Continue to PhonePe"
                  : "Payment completed"}
            </button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-400">
              <ShieldCheck className="h-4 w-4" />
              Payment verified securely with PhonePe.
            </p>
          </section>

          {/* ORDER SUMMARY */}

          <aside className="h-fit rounded-xl border border-gray-200 bg-white p-6 dark:border-[#232329] dark:bg-[#0c0c0e]">
            <div className="mb-5 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#e95f32]" />

              <h2 className="text-lg font-semibold text-gray-900 dark:text-[#f1f0f2]">
                Order summary
              </h2>
            </div>

            {(payment.bundle?.image || payment.course?.image) && (
              <img
                src={
                  payment.bundle?.image ??
                  payment.course?.image ??
                  ""
                }
                alt={title}
                className="mb-4 h-32 w-full rounded-lg object-cover"
              />
            )}

            <h3 className="font-semibold text-gray-900 dark:text-[#f1f0f2]">
              {title}
            </h3>

            {payment.bundle && (
              <div className="my-3 space-y-1">
                {payment.bundle.courses.map(({ course }) => (
                  <p
                    key={course.id}
                    className="text-sm text-gray-600 dark:text-[#a7a5ae]"
                  >
                    · {course.title}
                  </p>
                ))}
              </div>
            )}

            {payment.course?.category && (
              <p className="mb-4 text-sm text-gray-500">
                {payment.course.category}
              </p>
            )}

            <dl className="border-t border-gray-100 pt-4 dark:border-[#232329]">
              <div className="flex justify-between font-semibold text-gray-900 dark:text-[#f1f0f2]">
                <dt>Total due today</dt>
                <dd>{formatINR(payment.amount, 2)}</dd>
              </div>
            </dl>

            <p className="mt-5 text-xs leading-relaxed text-gray-400">
              You'll complete your secure payment on PhonePe. Access is
              unlocked only after PhonePe confirms the payment.
            </p>

            <span className="sr-only">
              <Lock />
            </span>
          </aside>
        </div>
      </main>
    </div>
  );
}
