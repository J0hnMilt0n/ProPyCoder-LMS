"use client";


import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { ArrowLeft, ArrowRight, BookOpen, Search, Users } from "lucide-react";
import toast from "react-hot-toast";
import { InstructorAvatar } from "@/components/instructor-avatar";
import { PriceTag } from "@/components/price-tag";
import { primeResourceCache, readResourceCache } from "@/lib/use-resource";

interface Course {
  id: string;
  title: string;
  description: string;
  category: string;
  level: string;
  price: number;
  offerPrice: number | null;
  image: string | null;
  duration: number;
  instructor: { firstName: string; lastName: string; avatar: string | null };
  _count: { enrollments: number };
}

const categories = [
  "Web Development",
  "Mobile Development",
  "Data Science",
  "DevOps",
  "Cloud Computing",
  "Python",
];
const levels = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

// Keep successful/attempted catalog fetch timestamps across client-side
// navigation so returning from a course detail page does not refetch fresh data.
const catalogFetchedAt = new Map<string, number>();
const catalogAttemptedAt = new Map<string, number>();
const CATALOG_STALE_AFTER = 30_000;
const CATALOG_RETRY_GUARD = 2_000;

// Warm a course's detail/content cache once per id on hover/focus.
const warmedCourses = new Set<string>();
function warmCourse(id: string) {
  if (!id || warmedCourses.has(id)) return;

  warmedCourses.add(id);
  void fetch(`/api/courses/${id}/warm`).catch(() => {
    // Permit another attempt if the preload failed.
    warmedCourses.delete(id);
  });
}

export default function CoursesPage() {
  const { data: session } = useSession();
  const [purchasedCourseIds, setPurchasedCourseIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [error, setError] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [retry, setRetry] = useState(0);
  const hasSearched = searchQuery.trim().length > 0;
  const activeCacheKey = `courses-list:${page}:${searchQuery.trim()}:${selectedCategory}:${selectedLevel}`;
  const backgroundRefreshRef = useRef(false);
  const shownCatalogSignatureRef = useRef("");
  const lastCatalogRevalidationRef = useRef(0);
  const lastPurchasedRefreshRef = useRef(0);
  const purchasedRefreshInFlightRef = useRef(false);

  // Hydrate from localStorage cache after mount so navigation restores the
// exact catalog state (page + last applied filters), not a stale default.
  useEffect(() => {
    const cached = readResourceCache<Course[]>(activeCacheKey, "public");
    if (cached) {
      setCourses(cached);
      setIsLoading(false);
    }
  }, [activeCacheKey]);

  // Revalidate only when the current catalog cache is stale. Browser events
  // can fire in clusters when returning from another page/tab, so debounce them.
  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState !== "visible") return;

      const now = Date.now();
      if (now - lastCatalogRevalidationRef.current < 1_500) return;
      lastCatalogRevalidationRef.current = now;

      const fetchedAt = catalogFetchedAt.get(activeCacheKey) ?? 0;
      const attemptedAt = catalogAttemptedAt.get(activeCacheKey) ?? 0;

      // Keep the restored catalog on screen and avoid refetching fresh data.
      if (now - fetchedAt < CATALOG_STALE_AFTER) return;
      // Also avoid aborting/restarting a request that has just started.
      if (now - attemptedAt < CATALOG_RETRY_GUARD) return;

      backgroundRefreshRef.current = true;
      setRetry((current) => current + 1);
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) revalidate();
    };

    window.addEventListener("focus", revalidate);
    window.addEventListener("popstate", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("popstate", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [activeCacheKey]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setPurchasedCourseIds((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }

    let active = true;
    const refreshPurchasedCourses = async (force = false) => {
      const now = Date.now();
      if (purchasedRefreshInFlightRef.current) return;
      if (!force && now - lastPurchasedRefreshRef.current < 30_000) return;

      purchasedRefreshInFlightRef.current = true;
      lastPurchasedRefreshRef.current = now;

      try {
        const response = await fetch("/api/enrollments/purchased", {
          cache: "no-store",
        });
        if (!response.ok) return;

        const result = (await response.json()) as { courseIds?: string[] };
        if (active) {
          setPurchasedCourseIds((prev) => {
            const next = new Set(result.courseIds ?? []);
            if (prev.size === next.size && [...prev].every((id) => next.has(id))) {
              return prev;
            }
            return next;
          });
        }
      } catch {
        // Keep the public catalog usable if the ownership lookup fails.
      } finally {
        purchasedRefreshInFlightRef.current = false;
      }
    };

    void refreshPurchasedCourses(true);

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void refreshPurchasedCourses();
    };

    const handleFocus = () => void refreshPurchasedCourses();
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      active = false;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [session?.user?.id]);

  useEffect(() => {
    // If this filter/page was fetched recently and its cached payload exists,
    // restore it without making another network request after navigation.
    if (retry === 0) {
      const freshCachedCourses = readResourceCache<Course[]>(activeCacheKey, "public");
      const fetchedAt = catalogFetchedAt.get(activeCacheKey) ?? 0;
      if (
        freshCachedCourses &&
        Date.now() - fetchedAt < CATALOG_STALE_AFTER
      ) {
        setCourses(freshCachedCourses);
        setIsLoading(false);
        setIsFiltering(false);
        return;
      }
    }

    const controller = new AbortController();
    let isCurrentRequest = true;
    const isBackgroundRefresh = backgroundRefreshRef.current;
    backgroundRefreshRef.current = false;
    const isFirstLoad = courses.length === 0 && !error && !hasSearched;
    if (!isBackgroundRefresh && isFirstLoad && isLoading) setIsLoading(true);
    else if (!isBackgroundRefresh) setIsFiltering(true);
    setError(false);
    // Instant for typing (bundle-style): short debounce keeps keystrokes
    // snappy, and we keep old results on screen instead of flashing
    // the skeleton on every keystroke.
    // The catalog payload can take a while on a cold server cache with a
    // remote DB; never let one hung request hold the page in its loading
    // state forever (a fresh first visit has no cache to fall back on).
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ page: String(page), limit: "9" });
      if (searchQuery.trim()) params.set("title", searchQuery.trim());
      if (selectedCategory) params.set("category", selectedCategory);
      if (selectedLevel) params.set("level", selectedLevel);
      const cacheKey = activeCacheKey;
      const cached = readResourceCache<Course[]>(cacheKey, "public");
      catalogAttemptedAt.set(cacheKey, Date.now());
      if (cached) {
        setCourses(cached);
        setIsLoading(false);
      }
      try {
        setError(false);
        const response = await fetch(`/api/courses?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Course request failed");
        const result = await response.json();
        if (!isCurrentRequest) return;
        const nextCourses: Course[] = Array.isArray(result.data)
          ? result.data
          : [];
        const nextPageCount = Math.max(1, result.pagination?.pages ?? 1);
        const nextSignature = JSON.stringify({
          courses: nextCourses,
          pageCount: nextPageCount,
        });
        if (nextSignature !== shownCatalogSignatureRef.current) {
          shownCatalogSignatureRef.current = nextSignature;
          setCourses(nextCourses);
          setPageCount(nextPageCount);
        }
        primeResourceCache(cacheKey, "public", nextCourses);
        catalogFetchedAt.set(cacheKey, Date.now());
      } catch (requestError) {
        if (!isCurrentRequest) return;
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          if (!cached && courses.length === 0) {
            setIsLoading(false);
            setError(true);
          } else {
            setIsLoading(false);
            setIsFiltering(false);
          }
          return;
        }
        if (!cached && courses.length === 0) {
          setError(true);
          toast.error("Could not load the course catalog");
        }
      } finally {
        window.clearTimeout(timeout);
        if (!controller.signal.aborted) {
          // Always release the blocking skeleton: success, empty results,
          // server errors, timeouts. Without this the catalog spins forever
          // whenever the fetch fails with no cache to fall back on (e.g. a
          // fresh first visit to /courses).
          setIsLoading(false);
          setIsFiltering(false);
        }
      }
    }, 120);

    return () => {
      isCurrentRequest = false;
      window.clearTimeout(timer);
      window.clearTimeout(timeout);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, retry, searchQuery, selectedCategory, selectedLevel, activeCacheKey]);

  function runSearch(value: string) {
    setSearchQuery(value);
    setPage(1);
  }

  function resetFilters() {
    setSearchInput("");
    setSearchQuery("");
    setSelectedCategory("");
    setSelectedLevel("");
    setPage(1);
  }

  return (
    <main className="catalog-page">
      <Navbar />
      <header className="catalog-hero">
        <div className="catalog-hero-inner">
          <div className="catalog-eyebrow">
            <BookOpen size={14} /> THE PROPYCODER LIBRARY
          </div>
          <div className="catalog-hero-row">
            <div>
              <h1>
                Find your next <em>skill.</em>
              </h1>
              <p>Practical courses for the things you want to make next.</p>
            </div>
            <div className="catalog-hero-note">
              <span>LEARN BY BUILDING</span>
              <strong>One project at a time.</strong>
            </div>
            <form
              className="catalog-hero-search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                runSearch(searchInput);
              }}
            >
              <div className="catalog-searchbar">
                <Search size={17} />
                <input
                  type="search"
                  aria-label="Search courses"
                  placeholder="Search Python, web development, data..."
                  value={searchInput}
                  onChange={(event) => {
                    setSearchInput(event.target.value);
                    runSearch(event.target.value);
                  }}
                />
                <button
                  type="submit"
                  className="catalog-search-go"
                  disabled={isFiltering}
                >
                  Search
                </button>
              </div>
            </form>
          </div>
        </div>
      </header>

      <section className="catalog-content">
        <div className="catalog-toolbar">
          <div className="catalog-results-label">
            {isLoading
              ? "Finding courses"
              : `${courses.length ? `Showing ${courses.length}` : "No"} ${courses.length === 1 ? "course" : "courses"}`}
            {isFiltering && !isLoading ? " · updating…" : ""}
          </div>
          <div className="catalog-filters">
            <label>
              <span>Category</span>
              <select
                value={selectedCategory}
                onChange={(event) => {
                  setSelectedCategory(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All topics</option>
                {categories.map((category) => (
                  <option value={category} key={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Level</span>
              <select
                value={selectedLevel}
                onChange={(event) => {
                  setSelectedLevel(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All levels</option>
                {levels.map((level) => (
                  <option value={level} key={level}>
                    {level.charAt(0) + level.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {isLoading ? (
          <div className="catalog-grid" aria-label="Loading courses">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="catalog-skeleton" key={index}>
                <span />
                <div />
                <div />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="catalog-empty">
            <BookOpen />
            <h2>The catalog is taking a break.</h2>
            <p>Your filters are saved. Try loading the courses again.</p>
            <button onClick={() => setRetry((current) => current + 1)}>
              Retry
            </button>
          </div>
        ) : courses.length === 0 ? (
          <div className="catalog-empty">
            <Search />
            <h2>
              {hasSearched
                ? `No courses match “${searchQuery.trim()}”.`
                : "No courses found."}
            </h2>
            <p>
              {hasSearched
                ? "Try a different term, or clear filters to browse everything."
                : "Try a different search or clear your filters."}
            </p>
            <button onClick={resetFilters}>Clear filters</button>
          </div>
        ) : (
          <div className="catalog-grid">
            {courses.map((course, index) => (
              <Link
                href={`/courses/${course.id}`}
                className="catalog-card cursor-pointer"
                key={course.id}
                aria-label={`View ${course.title}`}
                onMouseEnter={() => warmCourse(course.id)}
                onFocus={() => warmCourse(course.id)}
              >
                <div
                  className={`catalog-art catalog-art-${index % 3}`}
                  style={
                    course.image
                      ? {
                          backgroundImage: `linear-gradient(0deg, rgba(24, 24, 27, .25), rgba(24, 24, 27, .04)), url("${course.image}")`,
                        }
                      : undefined
                  }
                >
                  {!course.image && (
                    <>
                      <span className="catalog-art-category">
                        {course.category}
                      </span>
                      <span className="catalog-art-index">0{index + 1}</span>
                      <div className="catalog-art-glyph">
                        <BookOpen size={39} strokeWidth={1.3} />
                      </div>
                    </>
                  )}
                </div>

                <div className="catalog-card-body">
                  <div className="catalog-card-tags">
                    <span>{course.level.toLowerCase()}</span>
                    <span>
                      {course.duration} hour{course.duration === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="catalog-card-title">
                    <h2>{course.title}</h2>
                  </div>

                  <p>{course.description}</p>

                  <div className="catalog-instructor">
                    <InstructorAvatar
                      className="catalog-instructor-avatar"
                      avatar={course.instructor.avatar}
                      firstName={course.instructor.firstName}
                      lastName={course.instructor.lastName}
                    />
                    <span>
                      {course.instructor.firstName} {course.instructor.lastName}
                    </span>
                    <span className="catalog-student-count">
                      <Users size={13} /> {course._count.enrollments}
                    </span>
                  </div>

                  <div className="catalog-card-footer">
                    {purchasedCourseIds.has(course.id) ? (
                      <span className="purchased-pill">Purchased</span>
                    ) : (
                      <PriceTag
                        price={course.price}
                        offerPrice={course.offerPrice ?? null}
                      />
                    )}
                    <span className="catalog-card-action">
                      {session?.user ? "View course" : "Start learning"}
                      <ArrowRight size={15} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!isLoading && !error && pageCount > 1 && (
          <nav className="catalog-pagination" aria-label="Course pages">
            <button
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ArrowLeft size={15} /> Previous
            </button>
            <span>
              Page <strong>{page}</strong> of {pageCount}
            </span>
            <button
              disabled={page >= pageCount}
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
            >
              Next <ArrowRight size={15} />
            </button>
          </nav>
        )}
      </section>
      <footer className="catalog-footer">
        <span>PROPYCODER LEARNING</span>
        <span>Build the skill. Build the thing.</span>
        <Link href="/pycoder">
          Open PyCoder lab <ArrowRight size={14} />
        </Link>
      </footer>
    </main>
  );
}
