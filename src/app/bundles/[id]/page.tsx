"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LoaderCircle, Package, ShoppingCart, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { Navbar } from "@/components/navbar";
import { formatINR } from "@/lib/currency";
import { bundleMrpTotal, discountPercent } from "@/lib/pricing";

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
  const { status } = useSession();
  const [bundle, setBundle] = useState<DetailBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuying, setIsBuying] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/bundles/${id}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Bundle not found");
        const data = (await response.json()) as { bundle: DetailBundle };
        if (active) setBundle(data.bundle);
      } catch {
        toast.error("Bundle not found");
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

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
  const mrp = bundleMrpTotal(courses);
  const off = discountPercent({
    price: mrp,
    offerPrice: bundle.price > 0 && bundle.price < mrp ? bundle.price : null,
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
                    <span className="bundle-mrp">{formatINR(course.price)}</span>
                  </Link>
                </li>
              ))}
            </ul>

            <aside className="bundle-buy-card">
              <div className="bundle-pricing mb-3">
                <span className="bundle-mrp">{formatINR(mrp)}</span>
                <strong className="bundle-price" style={{ fontSize: "1.7rem" }}>
                  {formatINR(bundle.price)}
                </strong>
                {off > 0 && <span className="price-tag-badge">{off}% OFF</span>}
              </div>
              <p className="text-sm text-gray-600 mb-4">
                You save {formatINR(mrp - bundle.price)} — all{" "}
                {courses.length} courses, one payment.
              </p>
              <button
                className="bundle-buy w-full"
                onClick={() => void buyBundle()}
                disabled={isBuying}
              >
                {isBuying ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <>
                    <ShoppingCart size={15} /> Get this bundle
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

