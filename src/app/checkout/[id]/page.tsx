"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { formatINR } from "@/lib/currency";
import { ArrowLeft, Lock, ShieldCheck, Smartphone } from "lucide-react";
import toast from "react-hot-toast";

const REQUEST_TIMEOUT_MS = 15_000;

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
  course: { id: string; title: string; category: string | null; image: string | null } | null;
  bundle?: {
    id: string;
    title: string;
    image: string | null;
    courses: { course: { id: string; title: string } }[];
  } | null;
}

interface Props {
  params: Promise<{ id: string }>;
}

export default function CheckoutPage({ params }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const [paymentId, setPaymentId] = useState("");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);

  useEffect(() => {
    params.then(({ id }) => setPaymentId(id));
  }, [params]);

  const loadPayment = useCallback(async () => {
    if (!paymentId) return;
    try {
      const response = await fetch(`/api/payments/${paymentId}/complete`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error("Payment not found");
      const data = (await response.json()) as Payment;
      setPayment(data);
      if (data.status === "COMPLETED") {
        toast.success("Payment already completed");
        router.push(data.course ? `/courses/${data.course.id}` : "/dashboard");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load checkout");
      router.push("/courses");
    } finally {
      setIsLoading(false);
    }
  }, [paymentId, router]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
    else if (status === "authenticated") void loadPayment();
  }, [status, loadPayment, router]);

  useEffect(() => {
    if (searchParams.get("phonepe") !== "return" || status !== "authenticated" || payment?.status !== "PENDING") return;
    let cancelled = false;
    const verify = async () => {
      setIsPaying(true);
      try {
        const response = await fetch(`/api/payments/${payment.id}/complete`, {
          method: "POST",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const data = await response.json();
        if (cancelled) return;
        if (response.ok) {
          toast.success("Payment successful! Your access is ready.");
          router.push(payment.course ? `/courses/${payment.course.id}` : "/dashboard");
        } else {
          toast(data.error || "Payment is not confirmed yet. Try again shortly.");
          await loadPayment();
        }
      } catch {
        if (!cancelled) toast.error("Could not verify payment yet. Please try again shortly.");
      } finally {
        if (!cancelled) setIsPaying(false);
      }
    };
    void verify();
    return () => { cancelled = true; };
  }, [searchParams, status, payment, router, loadPayment]);

  const continueToPhonePe = () => {
    if (!payment || payment.status !== "PENDING" || isPaying) return;
    toast.error("Start a new payment from the course or bundle page to open PhonePe checkout.");
  };

  if (isLoading || status !== "authenticated") {
    return <div className="min-h-screen bg-gray-50 check-out-page"><Navbar /><div className="flex h-96 items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-4 border-[#e95f32] border-t-transparent" /></div></div>;
  }

  if (!payment) {
    return <div className="min-h-screen bg-gray-50 check-out-page"><Navbar /><div className="max-w-xl mx-auto py-20 px-4 text-center"><p className="text-gray-600 dark:text-[#a7a5ae]">Checkout not found.</p><button onClick={() => router.push("/courses")} className="mt-4 text-[#e95f32] font-semibold">Back to courses</button></div></div>;
  }

  const title = payment.bundle?.title ?? payment.course?.title ?? "Order";
  return (
    <div className="min-h-screen bg-gray-50 check-out-page">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-10">
        <button type="button" onClick={() => router.back()} className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 dark:text-[#a7a5ae]"><ArrowLeft className="h-4 w-4" />Back</button>
        <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-[#f1f0f2]">Checkout</h1>
        <div className="grid gap-6 md:grid-cols-[1fr_380px]">
          <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-[#232329] dark:bg-[#0c0c0e]">
            <div className="flex items-center gap-3">
              <Smartphone className="h-6 w-6 text-[#e95f32]" />
              <div><h2 className="font-semibold text-gray-900 dark:text-[#f1f0f2]">Secure PhonePe checkout</h2><p className="text-sm text-gray-600 dark:text-[#a7a5ae]">UPI, cards and net banking are handled securely by PhonePe.</p></div>
            </div>
            {searchParams.get("phonepe") === "return" && payment.status === "PENDING" && <p className="mt-4 text-sm text-amber-700">We’re checking your payment with PhonePe. If it remains pending, use the button below to return to checkout.</p>}
            <button type="button" onClick={continueToPhonePe} disabled={isPaying || payment.status !== "PENDING"} className="mt-6 w-full rounded-lg bg-[#e95f32] px-4 py-3 font-semibold text-white hover:bg-[#d9532a] disabled:opacity-60">
              {isPaying ? "Verifying payment…" : payment.status === "PENDING" ? "Continue to PhonePe" : `Payment ${payment.status.toLowerCase()}`}
            </button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-400"><ShieldCheck className="h-4 w-4" />Payment verified securely with PhonePe.</p>
          </section>
          <aside className="h-fit rounded-xl border border-gray-200 bg-white p-6 dark:border-[#232329] dark:bg-[#0c0c0e]">
            <div className="mb-5 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#e95f32]" /><h2 className="text-lg font-semibold text-gray-900 dark:text-[#f1f0f2]">Order summary</h2></div>
            {(payment.bundle?.image || payment.course?.image) && <img src={payment.bundle?.image ?? payment.course?.image ?? ""} alt={title} className="mb-4 h-32 w-full rounded-lg object-cover" />}
            <h3 className="font-semibold text-gray-900 dark:text-[#f1f0f2]">{title}</h3>
            {payment.bundle && <div className="my-3 space-y-1">{payment.bundle.courses.map(({ course }) => <p key={course.id} className="text-sm text-gray-600 dark:text-[#a7a5ae]">· {course.title}</p>)}</div>}
            {payment.course?.category && <p className="mb-4 text-sm text-gray-500">{payment.course.category}</p>}
            <dl className="border-t border-gray-100 pt-4 dark:border-[#232329]"><div className="flex justify-between font-semibold text-gray-900 dark:text-[#f1f0f2]"><dt>Total due today</dt><dd>{formatINR(payment.amount, 2)}</dd></div></dl>
            <p className="mt-5 text-xs leading-relaxed text-gray-400">You’ll complete your secure payment on PhonePe. Access is unlocked only after PhonePe confirms the payment.</p>
            <span className="sr-only"><Lock /></span>
          </aside>
        </div>
      </main>
    </div>
  );
}