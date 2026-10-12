"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowRight, LoaderCircle, Package, Search, ShoppingCart } from "lucide-react";
import toast from "react-hot-toast";
import { Navbar } from "@/components/navbar";
import { formatINR } from "@/lib/currency";
import { bundleMrpTotal, discountPercent } from "@/lib/pricing";

interface StoreBundle {
  id: string;
  title: string;
  description: string;
  image: string | null;
  price: number;
  courses: {
    course: { id: string; title: string; price: number; offerPrice: number | null };
  }[];
}

export default function BundlesPage() {
  const router = useRouter();
  const { status } = useSession();
  const [bundles, setBundles] = useState<StoreBundle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/bundles", { cache: "no-store" });
        if (!response.ok) throw new Error("Load failed");
        const data = (await response.json()) as { bundles: StoreBundle[] };
        if (active) setBundles(data.bundles);
      } catch {
        toast.error("Could not load bundles");
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function buyBundle(bundleId: string) {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    setBuyingId(bundleId);
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId }),
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
      setBuyingId(null);
    }
  }

  const query = searchQuery.trim().toLowerCase();
  const visibleBundles = query
    ? bundles.filter(
        (bundle) =>
          bundle.title.toLowerCase().includes(query) ||
          bundle.description.toLowerCase().includes(query) ||
          bundle.courses.some((entry) =>
            entry.course.title.toLowerCase().includes(query),
          ),
      )
    : bundles;

  return (
    <main className="catalog-page">
      <Navbar />
      <header className="catalog-hero">
        <div className="catalog-hero-inner">
          <div className="catalog-eyebrow">
            <Package size={14} /> LEARN MORE, PAY LESS
          </div>
          <div className="catalog-hero-row">
            <div>
              <h1>
                Course <em>bundles.</em>
              </h1>
              <p>
                Grab 2 or more courses together at a reduced price. One purchase
                unlocks every course in the bundle instantly.
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
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search bundles or their courses…"
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
        ) : bundles.length === 0 ? (
          <div className="catalog-empty">
            <Package />
            <h2>No bundles available right now.</h2>
            <p>Check back soon — bundle deals are on the way.</p>
            <Link href="/courses">Browse courses instead</Link>
          </div>
        ) : (
          <>
            <div className="catalog-toolbar">
              <div className="catalog-results-label">
                {`Showing ${visibleBundles.length} of ${bundles.length} ${bundles.length === 1 ? "bundle" : "bundles"}`}
              </div>
            </div>
            <div className="bundle-store">
              {visibleBundles.length === 0 ? (
                <div className="catalog-empty" style={{ gridColumn: "1 / -1" }}>
                  <Package />
                  <h2>No bundles match your search.</h2>
                  <p>Try a different term or clear the search box.</p>
                </div>
              ) : (
                visibleBundles.map((bundle) => {
                const mrp = bundleMrpTotal(
                  bundle.courses.map((entry) => entry.course),
                );
                const off = discountPercent({
                  price: mrp,
                  offerPrice:
                    bundle.price > 0 && bundle.price < mrp ? bundle.price : null,
                });
                return (
                  <article key={bundle.id} className="bundle-store-card">
                    <div className="bundle-store-cover">
                      {bundle.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={bundle.image} alt={bundle.title} />
                      ) : (
                        <Package size={44} />
                      )}
                    </div>
                    <div className="bundle-store-body">
                      <h3>
                        <Link
                          href={`/bundles/${bundle.id}`}
                          className="bundle-store-title"
                        >
                          {bundle.title}
                        </Link>
                      </h3>
                      <p>{bundle.description}</p>
                      <ul className="bundle-store-courses">
                        {bundle.courses.map((entry) => (
                          <li key={entry.course.id}>· {entry.course.title}</li>
                        ))}
                      </ul>
                      <div className="bundle-store-foot">
                        <span className="bundle-pricing">
                          <span className="bundle-mrp">{formatINR(mrp)}</span>
                          <strong className="bundle-price">
                            {formatINR(bundle.price)}
                          </strong>
                          {off > 0 && (
                            <span className="price-tag-badge">{off}% OFF</span>
                          )}
                        </span>
                        <button
                          className="bundle-buy"
                          onClick={() => void buyBundle(bundle.id)}
                          disabled={buyingId === bundle.id}
                        >
                          {buyingId === bundle.id ? (
                            <LoaderCircle size={15} className="animate-spin" />
                          ) : (
                            <>
                              <ShoppingCart size={14} /> Get bundle
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              }))}
            </div>
          </>)
        }
      </section>
      <footer className="catalog-footer">
        <span>PROPYCODER LEARNING</span>
        <span>Build the skill. Build the thing.</span>
        <Link href="/courses">
          Browse all courses <ArrowRight size={14} />
        </Link>
      </footer>
    </main>
  );
}
