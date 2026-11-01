"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Search,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";

import { Navbar } from "@/components/navbar";
import { InstructorAvatar } from "@/components/instructor-avatar";
import { PriceTag } from "@/components/price-tag";
import {
  primeResourceCache,
  readResourceCache,
} from "@/lib/use-resource";

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
  instructor: {
    firstName: string;
    lastName: string;
    avatar: string | null;
  };
  _count: {
    enrollments: number;
  };
}

interface CoursesApiResponse {
  data?: Course[];
  pagination?: {
    pages?: number;
  };
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

const CATALOG_CACHE_KEY = "courses-list:all";
const LEGACY_CACHE_KEY = "courses-list:1:::";
const PAGE_SIZE = 9;

const CATALOG_STALE_AFTER = 30_000;
const REVALIDATION_EVENT_GUARD = 1_500;
const REQUEST_TIMEOUT = 15_000;
const PURCHASED_REFRESH_INTERVAL = 30_000;

// These timestamps survive client-side navigation while this module
// remains loaded. The actual catalog is persisted using use-resource.ts.
let catalogFetchedAt = 0;
let catalogAttemptedAt = 0;

// Prevent duplicate catalog requests across component remounts.
let catalogRequestPromise: Promise<Course[]> | null = null;

// Warm course details once per course ID.
const warmedCourses = new Set<string>();

function warmCourse(id: string) {
  if (!id || warmedCourses.has(id)) return;

  warmedCourses.add(id);

  void fetch(`/api/courses/${id}/warm`).catch(() => {
    warmedCourses.delete(id);
  });
}

const normalize = (value: string | null | undefined) =>
  (value ?? "").trim().toLocaleLowerCase();

/**
 * Fetch every page from the existing paginated courses API.
 *
 * This runs only when loading or refreshing the catalog.
 * Searching and filtering never trigger API requests.
 */
async function fetchAllCourses(
  signal: AbortSignal,
): Promise<Course[]> {
  const firstParams = new URLSearchParams({
    page: "1",
    limit: String(PAGE_SIZE),
  });

  const firstResponse = await fetch(
    `/api/courses?${firstParams}`,
    {
      signal,
      cache: "no-store",
    },
  );

  if (!firstResponse.ok) {
    throw new Error("Course request failed");
  }

  const firstResult =
    (await firstResponse.json()) as CoursesApiResponse;

  const firstPage = Array.isArray(firstResult.data)
    ? firstResult.data
    : [];

  const totalPages = Math.max(
    1,
    firstResult.pagination?.pages ?? 1,
  );

  if (totalPages === 1) {
    return firstPage;
  }

  const remainingPages = await Promise.all(
    Array.from(
      { length: totalPages - 1 },
      async (_, index) => {
        const page = index + 2;

        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
        });

        const response = await fetch(
          `/api/courses?${params}`,
          {
            signal,
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error(
            `Could not load course page ${page}`,
          );
        }

        const result =
          (await response.json()) as CoursesApiResponse;

        return Array.isArray(result.data)
          ? result.data
          : [];
      },
    ),
  );

  return [...firstPage, ...remainingPages.flat()];
}

export default function CoursesPage() {
  const { data: session } = useSession();

  // Read the new complete-catalog cache first.
  // If it does not exist, use the old first-page cache temporarily
  // while the complete catalog is fetched in the background.
  const [courses, setCourses] = useState<Course[]>(() => {
    const completeCache = readResourceCache<Course[]>(
      CATALOG_CACHE_KEY,
      "public",
    );

    if (completeCache) {
      return completeCache;
    }

    return (
      readResourceCache<Course[]>(
        LEGACY_CACHE_KEY,
        "public",
      ) ?? []
    );
  });

  const [hasCompleteCatalog, setHasCompleteCatalog] =
    useState(() => {
      return Boolean(
        readResourceCache<Course[]>(
          CATALOG_CACHE_KEY,
          "public",
        ),
      );
    });

  const [isLoading, setIsLoading] = useState(() => {
    return (
      !readResourceCache<Course[]>(
        CATALOG_CACHE_KEY,
        "public",
      ) &&
      !readResourceCache<Course[]>(
        LEGACY_CACHE_KEY,
        "public",
      )
    );
  });

  const [error, setError] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState("");
  const [selectedLevel, setSelectedLevel] = useState("");

  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);

  const [purchasedCourseIds, setPurchasedCourseIds] =
    useState<Set<string>>(() => new Set());

  const lastCatalogRevalidationRef = useRef(0);
  const lastPurchasedRefreshRef = useRef(0);

  const purchasedRefreshInFlightRef = useRef(false);
  const catalogRequestInFlightRef = useRef(false);

  /**
   * INSTANT CLIENT-SIDE SEARCH
   *
   * This filters the already-loaded catalog directly.
   * No debounce, API request, or loading indicator is used.
   */
  const visibleCourses = useMemo(() => {
    const query = normalize(searchInput);

    return courses.filter((course) => {
      const matchesQuery =
        !query ||
        [
          course.title,
          course.description,
          course.category,
          course.level,
          course.instructor?.firstName,
          course.instructor?.lastName,
        ].some((value) =>
          normalize(value).includes(query),
        );

      const matchesCategory =
        !selectedCategory ||
        course.category === selectedCategory;

      const matchesLevel =
        !selectedLevel ||
        course.level === selectedLevel;

      return (
        matchesQuery &&
        matchesCategory &&
        matchesLevel
      );
    });
  }, [
    courses,
    searchInput,
    selectedCategory,
    selectedLevel,
  ]);

  const pageCount = Math.max(
    1,
    Math.ceil(visibleCourses.length / PAGE_SIZE),
  );

  const safePage = Math.min(page, pageCount);

  const paginatedCourses = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;

    return visibleCourses.slice(
      start,
      start + PAGE_SIZE,
    );
  }, [visibleCourses, safePage]);

  const hasActiveFilters =
    searchInput.trim().length > 0 ||
    Boolean(selectedCategory) ||
    Boolean(selectedLevel);

  /**
   * LOAD AND CACHE THE COMPLETE CATALOG
   *
   * Uses the existing resource-cache helpers and storage format.
   * The old per-page cache entries are not deleted or overwritten.
   */
  const loadCatalog = useCallback(
    async (force = false) => {
      const cached = readResourceCache<Course[]>(
        CATALOG_CACHE_KEY,
        "public",
      );

      const now = Date.now();

      // Use recently fetched catalog without another request.
      if (
        !force &&
        cached &&
        now - catalogFetchedAt < CATALOG_STALE_AFTER
      ) {
        setCourses(cached);
        setHasCompleteCatalog(true);
        setIsLoading(false);
        setError(false);
        return;
      }

      // Another request is already loading the catalog.
      if (catalogRequestInFlightRef.current) {
        return;
      }

      // Reuse an existing module-level request if available.
      if (catalogRequestPromise) {
        try {
          const result = await catalogRequestPromise;

          setCourses(result);
          setHasCompleteCatalog(true);
          setError(false);
        } catch {
          if (!cached) {
            setError(true);
          }
        } finally {
          setIsLoading(false);
        }

        return;
      }

      const controller = new AbortController();

      catalogRequestInFlightRef.current = true;
      catalogAttemptedAt = now;

      // Do not hide already-rendered cached courses.
      if (!courses.length && !cached) {
        setIsLoading(true);
      }

      setError(false);

      const timeout = window.setTimeout(() => {
        controller.abort();
      }, REQUEST_TIMEOUT);

      try {
        catalogRequestPromise = fetchAllCourses(
          controller.signal,
        );

        const nextCourses = await catalogRequestPromise;

        // Save the complete catalog using the existing cache system.
        primeResourceCache(
          CATALOG_CACHE_KEY,
          "public",
          nextCourses,
        );

        catalogFetchedAt = Date.now();

        setCourses(nextCourses);
        setHasCompleteCatalog(true);
        setError(false);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          if (!cached && courses.length === 0) {
            setError(true);
          }
        } else {
          if (!cached && courses.length === 0) {
            setError(true);
            toast.error(
              "Could not load the course catalog",
            );
          }
        }
      } finally {
        window.clearTimeout(timeout);

        catalogRequestPromise = null;
        catalogRequestInFlightRef.current = false;

        setIsLoading(false);
      }
    },
    [courses.length],
  );

  /**
   * INITIAL LOAD AND MANUAL RETRY
   */
  useEffect(() => {
    void loadCatalog(retry > 0);
  }, [loadCatalog, retry]);

  /**
   * BACKGROUND REVALIDATION
   *
   * Refreshes the catalog when returning to the page
   * without replacing the currently visible courses.
   */
  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      const now = Date.now();

      if (
        now - lastCatalogRevalidationRef.current <
        REVALIDATION_EVENT_GUARD
      ) {
        return;
      }

      lastCatalogRevalidationRef.current = now;

      if (
        now - catalogFetchedAt <
        CATALOG_STALE_AFTER
      ) {
        return;
      }

      if (
        now - catalogAttemptedAt <
        REVALIDATION_EVENT_GUARD
      ) {
        return;
      }

      void loadCatalog();
    };

    const handlePageShow = (
      event: PageTransitionEvent,
    ) => {
      if (event.persisted) {
        revalidate();
      }
    };

    window.addEventListener("focus", revalidate);
    window.addEventListener("popstate", revalidate);

    document.addEventListener(
      "visibilitychange",
      revalidate,
    );

    window.addEventListener(
      "pageshow",
      handlePageShow,
    );

    return () => {
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("popstate", revalidate);

      document.removeEventListener(
        "visibilitychange",
        revalidate,
      );

      window.removeEventListener(
        "pageshow",
        handlePageShow,
      );
    };
  }, [loadCatalog]);

  /**
   * PURCHASED COURSE LOOKUP
   *
   * This remains independent of the public course catalog.
   */
  useEffect(() => {
    const userId = session?.user?.id;

    if (!userId) {
      setPurchasedCourseIds((previous) =>
        previous.size === 0
          ? previous
          : new Set(),
      );

      return;
    }

    let active = true;

    const refreshPurchasedCourses = async (
      force = false,
    ) => {
      const now = Date.now();

      if (purchasedRefreshInFlightRef.current) {
        return;
      }

      if (
        !force &&
        now - lastPurchasedRefreshRef.current <
          PURCHASED_REFRESH_INTERVAL
      ) {
        return;
      }

      purchasedRefreshInFlightRef.current = true;
      lastPurchasedRefreshRef.current = now;

      try {
        const response = await fetch(
          "/api/enrollments/purchased",
          {
            cache: "no-store",
          },
        );

        if (!response.ok) {
          return;
        }

        const result = (await response.json()) as {
          courseIds?: string[];
        };

        if (!active) {
          return;
        }

        setPurchasedCourseIds((previous) => {
          const next = new Set(
            result.courseIds ?? [],
          );

          const unchanged =
            previous.size === next.size &&
            [...previous].every((id) =>
              next.has(id),
            );

          return unchanged ? previous : next;
        });
      } catch {
        // Keep the public catalog usable if ownership
        // lookup fails.
      } finally {
        purchasedRefreshInFlightRef.current = false;
      }
    };

    void refreshPurchasedCourses(true);

    const handleFocus = () => {
      void refreshPurchasedCourses();
    };

    const handlePageShow = (
      event: PageTransitionEvent,
    ) => {
      if (event.persisted) {
        void refreshPurchasedCourses();
      }
    };

    window.addEventListener("focus", handleFocus);

    window.addEventListener(
      "pageshow",
      handlePageShow,
    );

    return () => {
      active = false;

      window.removeEventListener(
        "focus",
        handleFocus,
      );

      window.removeEventListener(
        "pageshow",
        handlePageShow,
      );
    };
  }, [session?.user?.id]);

  /**
   * FILTER HANDLERS
   */
  function resetFilters() {
    setSearchInput("");
    setSelectedCategory("");
    setSelectedLevel("");
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearchInput(value);
    setPage(1);
  }

  function updateCategory(value: string) {
    setSelectedCategory(value);
    setPage(1);
  }

  function updateLevel(value: string) {
    setSelectedLevel(value);
    setPage(1);
  }

  return (
    <main className="catalog-page">
      <Navbar />

      <header className="catalog-hero">
        <div className="catalog-hero-inner">
          <div className="catalog-eyebrow">
            <BookOpen size={14} />
            THE PROPYCODER LIBRARY
          </div>

          <div className="catalog-hero-row">
            <div>
              <h1>
                Find your next <em>skill.</em>
              </h1>

              <p>
                Practical courses for the things you
                want to make next.
              </p>
            </div>

            <div className="catalog-hero-note">
              <span>LEARN BY BUILDING</span>
              <strong>
                One project at a time.
              </strong>
            </div>

            <form
              className="catalog-hero-search"
              role="search"
              onSubmit={(event) =>
                event.preventDefault()
              }
            >
              <div className="catalog-searchbar">
                <Search size={17} />

                <input
                  type="search"
                  aria-label="Search courses"
                  placeholder="Search Python, web development, data..."
                  value={searchInput}
                  onChange={(event) =>
                    updateSearch(event.target.value)
                  }
                />

                {searchInput && (
                  <button
                    type="button"
                    className="catalog-search-clear"
                    aria-label="Clear search"
                    onClick={() =>
                      updateSearch("")
                    }
                  >
                    ×
                  </button>
                )}

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

      <section className="catalog-content">
        <div className="catalog-toolbar">
          <div
            className="catalog-results-label"
            aria-live="polite"
          >
            {isLoading && courses.length === 0
              ? "Finding courses"
              : !hasCompleteCatalog &&
                  courses.length > 0
                ? `Showing cached courses`
                : `Showing ${visibleCourses.length} ${
                    visibleCourses.length === 1
                      ? "course"
                      : "courses"
                  }`}
          </div>

          <div className="catalog-filters">
            <label>
              <span>Category</span>

              <select
                value={selectedCategory}
                onChange={(event) =>
                  updateCategory(event.target.value)
                }
              >
                <option value="">All topics</option>

                {categories.map((category) => (
                  <option
                    value={category}
                    key={category}
                  >
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Level</span>

              <select
                value={selectedLevel}
                onChange={(event) =>
                  updateLevel(event.target.value)
                }
              >
                <option value="">All levels</option>

                {levels.map((level) => (
                  <option
                    value={level}
                    key={level}
                  >
                    {level.charAt(0) +
                      level.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {isLoading && courses.length === 0 ? (
          <div
            className="catalog-grid"
            aria-label="Loading courses"
          >
            {Array.from(
              { length: 6 },
              (_, index) => (
                <div
                  className="catalog-skeleton"
                  key={index}
                >
                  <span />
                  <div />
                  <div />
                </div>
              ),
            )}
          </div>
        ) : error && courses.length === 0 ? (
          <div className="catalog-empty">
            <BookOpen />

            <h2>
              The catalog is taking a break.
            </h2>

            <p>
              Your filters are saved. Try loading
              the courses again.
            </p>

            <button
              onClick={() =>
                setRetry((current) => current + 1)
              }
            >
              Retry
            </button>
          </div>
        ) : visibleCourses.length === 0 ? (
          <div className="catalog-empty">
            <Search />

            <h2>
              {hasActiveFilters
                ? "No courses match your search."
                : "No courses found."}
            </h2>

            <p>
              {hasActiveFilters
                ? "Try a different term or clear your filters to browse everything."
                : "Check back soon for new courses."}
            </p>

            {hasActiveFilters && (
              <button onClick={resetFilters}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="catalog-grid">
            {paginatedCourses.map(
              (course, index) => (
                <Link
                  href={`/courses/${course.id}`}
                  key={course.id}
                  className="catalog-card cursor-pointer"
                  onMouseEnter={() =>
                    warmCourse(course.id)
                  }
                  onFocus={() =>
                    warmCourse(course.id)
                  }
                  aria-label={`View course: ${course.title}`}
                >
                  <div
                    className={`catalog-art catalog-art-${
                      index % 3
                    }`}
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

                        <span className="catalog-art-index">
                          {String(
                            (safePage - 1) *
                              PAGE_SIZE +
                              index +
                              1,
                          ).padStart(2, "0")}
                        </span>

                        <div className="catalog-art-glyph">
                          <BookOpen
                            size={39}
                            strokeWidth={1.3}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="catalog-card-body">
                    <div className="catalog-card-tags">
                      <span>
                        {course.level.toLowerCase()}
                      </span>

                      <span>
                        {course.duration} hour
                        {course.duration === 1
                          ? ""
                          : "s"}
                      </span>
                    </div>

                    <div className="catalog-card-title">
                      <h2>{course.title}</h2>
                    </div>

                    <p>{course.description}</p>

                    <div className="catalog-instructor">
                      <InstructorAvatar
                        className="catalog-instructor-avatar"
                        avatar={
                          course.instructor?.avatar ??
                          null
                        }
                        firstName={
                          course.instructor?.firstName ??
                          ""
                        }
                        lastName={
                          course.instructor?.lastName ??
                          ""
                        }
                      />

                      <span>
                        {course.instructor?.firstName}{" "}
                        {course.instructor?.lastName}
                      </span>

                      <span className="catalog-student-count">
                        <Users size={13} />
                        {course._count?.enrollments ??
                          0}
                      </span>
                    </div>

                    <div className="catalog-card-footer">
                      {purchasedCourseIds.has(
                        course.id,
                      ) ? (
                        <span className="purchased-pill">
                          Purchased
                        </span>
                      ) : (
                        <PriceTag
                          price={course.price}
                          offerPrice={
                            course.offerPrice ?? null
                          }
                        />
                      )}

                      <span className="catalog-card-action">
                        View course
                        <ArrowRight size={15} />
                      </span>
                    </div>
                  </div>
                </Link>
              ),
            )}
          </div>
        )}

        {!isLoading &&
          !error &&
          pageCount > 1 && (
            <nav
              className="catalog-pagination"
              aria-label="Course pages"
            >
              <button
                disabled={safePage <= 1}
                onClick={() =>
                  setPage((current) =>
                    Math.max(1, current - 1),
                  )
                }
              >
                <ArrowLeft size={15} />
                Previous
              </button>

              <span>
                Page <strong>{safePage}</strong> of{" "}
                {pageCount}
              </span>

              <button
                disabled={safePage >= pageCount}
                onClick={() =>
                  setPage((current) =>
                    Math.min(
                      pageCount,
                      current + 1,
                    ),
                  )
                }
              >
                Next
                <ArrowRight size={15} />
              </button>
            </nav>
          )}
      </section>

      <footer className="catalog-footer">
        <span>PROPYCODER LEARNING</span>

        <span>
          Build the skill. Build the thing.
        </span>

        <Link href="/pycoder">
          Open PyCoder lab
          <ArrowRight size={14} />
        </Link>
      </footer>
    </main>
  );
}