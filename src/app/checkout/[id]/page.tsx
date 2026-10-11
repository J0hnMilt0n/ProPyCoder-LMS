"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import {
  CreditCard,
  Landmark,
  Lock,
  ArrowLeft,
  LoaderCircle,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import toast from "react-hot-toast";

// Demo bank list for the "Net banking" option.
const BANKS = ["HDFC Bank", "ICICI Bank", "SBI", "Axis Bank", "Kotak Bank"];

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
  course: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    image: string | null;
    instructor?: { firstName: string; lastName: string } | null;
  };
  enrollment?: { id: string } | null;
}

interface Props {
  params: Promise<{ id: string }>;
}

export default function CheckoutPage({ params }: Props) {
  const router = useRouter();
  const { status } = useSession();
  const [paymentId, setPaymentId] = useState<string>("");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);

  // Card form fields (demo only — no real processor is wired up).
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");

  // Payment method: CARD | UPI | NETBANKING (demo only).
  const [method, setMethod] = useState<"CARD" | "UPI" | "NETBANKING">("CARD");
  const [upiId, setUpiId] = useState("");
  const [selectedBank, setSelectedBank] = useState(BANKS[0]);

  useEffect(() => {
    params.then((p) => setPaymentId(p.id));
  }, [params]);

  const loadPayment = useCallback(async () => {
    if (!paymentId) return;
    try {
      const response = await fetch(`/api/payments/${paymentId}/complete`);
      if (response.ok) {
        const data = await response.json();
        setPayment(data);
        // Already paid → send them straight to the course.
        if (data.status === "COMPLETED" && data.enrollment) {
          toast.success("Payment already completed");
          router.push(`/courses/${data.course.id}`);
        }
      } else {
        const error = await response.json();
        toast.error(error.error || "Payment not found");
        router.push("/courses");
      }
    } catch {
      toast.error("Failed to load checkout");
    } finally {
      setIsLoading(false);
    }
  }, [paymentId, router]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated") {
      void loadPayment();
    }
  }, [status, loadPayment, router]);

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  };

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  };

  const handlePay = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!payment || isPaying) return;

    // Validate the fields relevant to the selected method (demo only).
    if (method === "CARD") {
      const digits = cardNumber.replace(/\D/g, "");
      if (digits.length < 15) {
        toast.error("Enter a valid card number");
        return;
      }
      if (!/^\d{2}\/\d{2}$/.test(expiry)) {
        toast.error("Enter a valid expiry date (MM/YY)");
        return;
      }
      if (cvc.replace(/\D/g, "").length < 3) {
        toast.error("Enter a valid security code");
        return;
      }
    } else if (method === "UPI") {
      if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upiId.trim())) {
        toast.error("Enter a valid UPI ID (e.g. name@bank)");
        return;
      }
    }

    setIsPaying(true);
    try {
      const response = await fetch(`/api/payments/${payment.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: `TXN_${Date.now()}`,
          paymentMethod: method,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || "Payment failed");
        return;
      }
      toast.success("Payment successful! You are now enrolled.");
      router.push(`/courses/${payment.course.id}`);
    } catch {
      toast.error("An error occurred while processing payment");
    } finally {
      setIsPaying(false);
    }
  };

  if (isLoading || status !== "authenticated") {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#e95f32] border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-xl mx-auto py-20 px-4 text-center">
          <p className="text-gray-600">Checkout not found.</p>
          <button
            onClick={() => router.push("/courses")}
            className="mt-4 text-[#e95f32] font-semibold"
          >
            Back to courses
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 py-10">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">Checkout</h1>

        <div className="grid md:grid-cols-[1fr_380px] gap-6">
          {/* Payment form */}
          <form
            onSubmit={handlePay}
            className="bg-white rounded-xl border border-gray-200 p-6"
          >
            <div className="flex items-center gap-2 mb-5">
              <CreditCard className="h-5 w-5 text-[#e95f32]" />
              <h2 className="text-lg font-semibold text-gray-900">
                Payment method
              </h2>
            </div>

            {/* Method tabs: Card / UPI / Net banking */}
            <div className="grid grid-cols-3 gap-2 mb-6" role="tablist">
              {(
                [
                  { key: "CARD", label: "Card", Icon: CreditCard },
                  { key: "UPI", label: "UPI", Icon: Smartphone },
                  { key: "NETBANKING", label: "Net banking", Icon: Landmark },
                ] as const
              ).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={method === key}
                  onClick={() => setMethod(key)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-semibold transition ${
                    method === key
                      ? "border-[#e95f32] bg-[#fdf3ef] text-[#e95f32]"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>

            {method === "CARD" && (
              <>
                <label className="block mb-4">
                  <span className="text-sm font-medium text-gray-700">
                    Name on card
                  </span>
                  <input
                    type="text"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    placeholder="Alex Johnson"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#e95f32] focus:outline-none"
                  />
                </label>

            <label className="block mb-4">
              <span className="text-sm font-medium text-gray-700">
                Card number
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                placeholder="4242 4242 4242 4242"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tracking-wider focus:border-[#e95f32] focus:outline-none"
              />
            </label>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Expiry</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={expiry}
                  onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                  placeholder="MM/YY"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#e95f32] focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">CVC</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cvc}
                  onChange={(e) =>
                    setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="123"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#e95f32] focus:outline-none"
                />
              </label>
                </div>
              </>
            )}

            {method === "UPI" && (
              <div className="mb-6">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">
                    UPI ID
                  </span>
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="yourname@bank"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#e95f32] focus:outline-none"
                  />
                </label>
                <p className="mt-2 text-xs text-gray-400">
                  Pay from any UPI app (Google Pay, PhonePe, Paytm, etc.).
                </p>
              </div>
            )}

            {method === "NETBANKING" && (
              <div className="mb-6">
                <span className="text-sm font-medium text-gray-700">
                  Choose your bank
                </span>
                <div className="mt-2 space-y-2">
                  {BANKS.map((bank) => (
                    <label
                      key={bank}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition ${
                        selectedBank === bank
                          ? "border-[#e95f32] bg-[#fdf3ef] text-gray-900"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="bank"
                        className="accent-[#e95f32]"
                        checked={selectedBank === bank}
                        onChange={() => setSelectedBank(bank)}
                      />
                      {bank}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isPaying}
              className="w-full py-3 rounded-lg bg-[#e95f32] text-white font-semibold hover:bg-[#d94c20] transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isPaying ? (
                <>
                  <LoaderCircle className="h-5 w-5 animate-spin" /> Processing...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" /> Pay ${payment.amount.toFixed(2)}
                </>
              )}
            </button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-400">
              <ShieldCheck className="h-4 w-4" /> Demo checkout — no real card
              is charged.
            </p>
          </form>

          {/* Order summary */}
          <aside className="bg-white rounded-xl border border-gray-200 p-6 h-fit">
            <div className="flex items-center gap-2 mb-5">
              <ShieldCheck className="h-5 w-5 text-[#e95f32]" />
              <h2 className="text-lg font-semibold text-gray-900">
                Order summary
              </h2>
            </div>

            {payment.course.image && (
              <img
                src={payment.course.image}
                alt={payment.course.title}
                className="w-full h-32 object-cover rounded-lg mb-4"
              />
            )}

            <h3 className="font-semibold text-gray-900">
              {payment.course.title}
            </h3>
            {payment.course.category && (
              <p className="text-sm text-gray-500 mb-4">
                {payment.course.category}
              </p>
            )}

            {payment.course.instructor && (
              <p className="text-sm text-gray-600 mb-4">
                by {payment.course.instructor.firstName}{" "}
                {payment.course.instructor.lastName}
              </p>
            )}

            <dl className="space-y-2 border-t border-gray-100 pt-4 text-sm">
              <div className="flex justify-between text-gray-600">
                <dt>Course price</dt>
                <dd>{payment.amount.toFixed(2)} {payment.currency}</dd>
              </div>
              <div className="flex justify-between text-gray-600">
                <dt>Lifetime access</dt>
                <dd>Included</dd>
              </div>
              <div className="flex justify-between font-semibold text-gray-900 text-base pt-2 border-t border-gray-100">
                <dt>Total due today</dt>
                <dd>{payment.amount.toFixed(2)} {payment.currency}</dd>
              </div>
            </dl>

            <p className="mt-5 text-xs text-gray-400 leading-relaxed">
              This is a demonstration checkout. No real payment is processed and
              no card is charged.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}


