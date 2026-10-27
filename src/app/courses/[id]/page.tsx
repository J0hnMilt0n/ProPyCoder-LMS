"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { PriceTag } from "@/components/price-tag";
import { formatINR } from "@/lib/currency";
import {
  Clock,
  ArrowLeft,
  Users,
  Award,
  BookOpen,
  CheckCircle,
  PlayCircle,
  Lock,
  CreditCard,
  Radio,
  Video,
} from "lucide-react";
import toast from "react-hot-toast";
import { LessonVideoPlayer } from "@/components/lesson-video-player";
import {
  primeResourceCache,
  readResourceCache,
} from "@/lib/use-resource";
import {
  PROVIDER_LABELS,
  STATUS_LABELS,
  effectiveStatus,
} from "@/lib/live-classes";

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  order: number;
  videoUrl: string | null;
  videoId: string | null;
  duration: number | null;
  isFree: boolean;
}

interface Module {
  id: string;
  title: string;
  description: string | null;
  order: number;
  lessons: Lesson[];
}

interface CourseDetail {
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
    id: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
  };
  modules: Array<{
    id: string;
    title: string;
  }>;
  _count: {
    enrollments: number;
  };
}

interface Props {
  params: Promise<{ id: string }>;
}

// Detect the real scrolling surface each time; the page may become scrollable
// only after the course modules/video player have rendered.
type CourseScrollTarget = Window | HTMLElement;

function isScrollableElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return (
    ["auto", "scroll", "overlay"].includes(style.overflowY) &&
    element.scrollHeight > element.clientHeight + 1
  );
}

function getCourseScrollTarget(): CourseScrollTarget {
  const page = document.querySelector<HTMLElement>(".course-detail-page");
  if (!page) return window;

  // First prefer a scrollable ancestor of the course page.
  let ancestor: HTMLElement | null = page;
  while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
    if (isScrollableElement(ancestor)) return ancestor;
    ancestor = ancestor.parentElement;
  }

  // Some layouts scroll an element inside the page instead of the window.
  const descendants = Array.from(
    page.querySelectorAll<HTMLElement>("*")
  ).filter(isScrollableElement);
  if (descendants.length > 0) {
    return descendants.reduce((largest, current) => {
      const currentRange = current.scrollHeight - current.clientHeight;
      const largestRange = largest.scrollHeight - largest.clientHeight;
      return currentRange > largestRange ? current : largest;
    });
  }

  return window;
}

function isWindowScrollTarget(target: CourseScrollTarget): target is Window {
  return target === window;
}

function readCourseScrollPosition(target: CourseScrollTarget): number {
  return isWindowScrollTarget(target) ? window.scrollY : target.scrollTop;
}

function writeCourseScrollPosition(target: CourseScrollTarget, top: number): void {
  if (isWindowScrollTarget(target)) {
    window.scrollTo({ top, left: 0, behavior: "auto" });
    return;
  }

  target.scrollTop = top;
}

interface LiveClassItem {
  id: string;
  title: string;
  description: string | null;
  provider: string;
  meetingUrl?: string;
  startsAt: string;
  endsAt: string;
  courseId: string;
  status: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
  storedStatus?: string;
}

// Any single API request slower than this is abandoned instead of holding
// the page in its loading state (dev-compile stalls, stalled DB
// connections — the classic "Back from checkout spins forever").
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Attach a benign rejection handler up front and return a null-safe
 * promise — a failed, timed-out, or never-consumed auxiliary request can
 * neither surface as an unhandled rejection nor escape into the course
 * render path and block the page.
 */
function settle(request: Promise<Response>): Promise<Response | null> {
  return request.catch(() => null);
}

export default function CourseDetailPage({ params }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  // Resolve the route ID from Next.js navigation state after hydration.
  const [courseId, setCourseId] = useState<string>("");
  const [course, setCourse] = useState<CourseDetail | null>(() => {
    if (!courseId) return null;
    const cached = readResourceCache<CourseDetail>("course-detail", `public:${courseId}`);
    // Placeholder / legacy cache entries may not carry `modules`;
    // normalize once here so the render can trust the shape.
    return cached ? { ...cached, modules: cached.modules ?? [] } : null;
  });
  const [modules, setModules] = useState<Module[]>(
    () =>
      (courseId
        ? readResourceCache<Module[]>("course-modules", `public:${courseId}`)
        : null) ?? [],
  );
  // Start unblocked when the first paint was primed from localStorage (back
  // navigation, lab -> courses return) so the cached content paints instantly
  // with no spinner flash. A true first visit still starts blocked.
  const [isLoading, setIsLoading] = useState<boolean>(() => !course);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [accessResolvedCourseId, setAccessResolvedCourseId] = useState("");
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(
    new Set(),
  );
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);
  const isRestoringScroll = useRef(false);
  const [certificateId, setCertificateId] = useState<string | null>(null);
  const [liveClasses, setLiveClasses] = useState<LiveClassItem[]>([]);
  const totalLessons = modules.reduce(
    (total, module) => total + module.lessons.length,
    0,
  );
  const completedLessons = completedLessonIds.size;

  useEffect(() => {
    const id = pathname.split("/").filter(Boolean).at(-1);
    if (!id || id === "courses") return;

    const restore = () => {
      const cachedCourse = readResourceCache<CourseDetail>("course-detail", `public:${id}`);
      if (cachedCourse) {
        setCourse({ ...cachedCourse, modules: cachedCourse.modules ?? [] });
        const cachedModules = readResourceCache<Module[]>("course-modules", `public:${id}`);
        if (cachedModules) setModules(cachedModules);
        setIsLoading(false);
      }
      setCourseId(id);
      try {
        window.sessionStorage.setItem("propycoder-last-course", id);
      } catch {
        // Storage unavailable.
      }
    };

    restore();
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, [pathname]);

  useEffect(() => {
    // Keep courseId in sync with the router params (covers trailing-slash /
    // rewrite edge cases); the first paint already derived it from the URL.
    params.then((p) => {
      if (!p.id) return;
      // params is the authoritative source: the synchronous URL read
      // above returns "" during SSR/hydration (React reuses the server
      // render), so without this call the courseId-keyed fetch effect
      // never fires and the page spins forever on back navigation.
      setCourseId(p.id);
      try {
        window.sessionStorage.setItem("propycoder-last-course", p.id);
      } catch {
        // Storage unavailable.
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Use the authenticated endpoint for enrolled users/staff (which can expose
  // the join URL), and the public-safe listing for signed-out/non-enrolled
  // visitors (which never contains meeting credentials).
  const sessionUserId = session?.user?.id ?? null;
  useEffect(() => {
    if (!courseId) {
      setLiveClasses([]);
      return;
    }
    let cancelled = false;
    const publicCacheKey = `course-live-classes:${courseId}`;
    const privateCacheKey = `course-live-classes:${sessionUserId}:${courseId}`;
    const cachedPublic = readResourceCache<LiveClassItem[]>(
      publicCacheKey,
      "public",
    );
    const cachedPrivate = sessionUserId
      ? readResourceCache<LiveClassItem[]>(privateCacheKey, sessionUserId)
      : null;
    const initialClasses = cachedPrivate ?? cachedPublic;
    if (initialClasses) setLiveClasses(initialClasses);

    (async () => {
      try {
        let response = sessionUserId
          ? await fetch(`/api/live-classes?courseId=${encodeURIComponent(courseId)}`, {
              cache: "no-store",
            })
          : await fetch("/api/live-classes?scope=public", {
              cache: "no-store",
            });
        let responseContainsCredentials = Boolean(sessionUserId);
        // A signed-in visitor who hasn't enrolled should still see the public
        // schedule, but must not receive the protected meeting credentials.
        if (sessionUserId && response.status === 403) {
          response = await fetch("/api/live-classes?scope=public", {
            cache: "no-store",
          });
          responseContainsCredentials = false;
        }
        if (!response.ok) {
          if (!cancelled && !initialClasses) setLiveClasses([]);
          return;
        }
        const result = await response.json();
        if (cancelled) return;
        // Keep upcoming + recently-finished sessions only.
        const cutoff = Date.now() - 60 * 60 * 1000;
        const visibleClasses = (result.data ?? []).filter(
            (item: LiveClassItem) =>
              item.courseId === courseId &&
              new Date(item.endsAt).getTime() >= cutoff,
          ) as LiveClassItem[];
        if (responseContainsCredentials) {
          // Credential-bearing entries must never be written to shared/public
          // storage. Scope them to the authenticated user and this course.
          primeResourceCache(privateCacheKey, sessionUserId!, visibleClasses);
        } else {
          primeResourceCache(publicCacheKey, "public", visibleClasses);
        }
        setLiveClasses(visibleClasses);
      } catch {
        if (!cancelled && !initialClasses) setLiveClasses([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, sessionUserId]);

  const loadCourse = useCallback(async () => {
    try {
      // All four requests are independent of each other. The database is
      // remote, so awaiting them one after another made the page wait for
      // the SUM of four round trips.
      // Course first paint wins here: the spinner gates ONLY on the
      // course payload settled in the inner try block below.
      const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const [courseRequest, lessonsRequest, progressRequest, certsRequest] = [
        fetch(`/api/courses/${courseId}`, { signal }),
        fetch(`/api/lessons?courseId=${encodeURIComponent(courseId)}`, {
          signal,
        }),
        fetch(`/api/progress?courseId=${encodeURIComponent(courseId)}`, {
          signal,
        }),
        fetch("/api/certificates", { signal }),
      ];
      const [lessonsResponse, progressResponse, certResponse] = [
        settle(lessonsRequest),
        settle(progressRequest),
        settle(certsRequest),
      ];

      let courseTitle = "";
      try {
        // `await` waits ONLY for the course payload (the old Promise.all
        // held the spinner until the slowest of four requests).
        const response = await courseRequest;
      
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            errorData?.error || errorData?.message || "Course not found",
          );
        }

        const data: CourseDetail = await response.json();
        if (!data || typeof data !== "object" || !data.id) {
          throw new Error("Invalid course data received from the server");
        }

        courseTitle = data.title;
        setCourse({ ...data, modules: data.modules ?? [] });
        // Cache for instant first paint on the next visit (paint-first from
        // localStorage, then this background fetch patches what changed).
        primeResourceCache<CourseDetail>(
          "course-detail",
          `public:${courseId}`,
          data,
        );
        // Remember this course so the navbar "Courses" tab can return
        // here (lab ÔåÆ courses switch) instead of always showing the list.
        try {
          window.sessionStorage.setItem("propycoder-last-course", courseId);
        } catch {
          // Storage unavailable.
        }
      } catch {
        // The gating request failed or timed out: fall through to the
        // finally below, which clears the spinner so the page renders its
        // not-found state instead of spinning forever.
      } finally {
        // THE spinner gate. `await courseRequest` above is the ONLY request
        // the page waits on — this always runs, so Back-from-checkout can
        // never get stuck on the loading state again.
        setIsLoading(false);
      }

      // Auxiliary lane: fully detached from the spinner and from the course
      // payload. A slow/hung/failed lessons call only degrades the
      // curriculum section — it can no longer block first paint.
      const lessonsData = await (async (): Promise<{
        modules?: Module[];
        isEnrolled?: boolean;
      } | null> => {
        try {
          const res = await lessonsResponse;
          if (!res?.ok) return null;
          return (await res.json()) as {
            modules?: Module[];
            isEnrolled?: boolean;
          };
        } catch {
          return null;
        }
      })();

      if (lessonsData) {
        const loadedModules: Module[] = lessonsData.modules ?? [];
        setModules(loadedModules);
        setIsEnrolled(lessonsData.isEnrolled ?? false);
        setAccessResolvedCourseId(courseId);
        primeResourceCache<Module[]>(
          "course-modules",
          `public:${courseId}`,
          loadedModules,
        );

        // Fetched in parallel above; only meaningful for enrolled users
        // (401 when signed out, empty otherwise). Lookup must finish
        // before selecting the resume lesson below. Timeouts and network
        // failures resolve to empty progress, never a page hang.
        if (lessonsData.isEnrolled) {
          const completedIds = await (async (): Promise<string[]> => {
            try {
              const res = await progressResponse;
              if (!res?.ok) return [];
              const progressJson = (await res.json()) as {
                data?: unknown;
              };
              if (!Array.isArray(progressJson.data)) return [];
              return (progressJson.data as { status?: string }[])
                .filter((item) => item.status === "COMPLETED")
                .map((item, index) =>
                  typeof (item as { lessonId?: unknown }).lessonId ===
                  "string"
                    ? ((item as { lessonId: string }).lessonId as string)
                    : `missing-${index}`,
                )
                .filter((lessonId) => !lessonId.startsWith("missing-"));
            } catch {
              return [];
            }
            })();
          setCompletedLessonIds(new Set(completedIds));
        }

        // If a certificate already exists for this course, surface it
        // (also fetched in parallel above). A failed/timed-out cert
        // lookup just hides the certificate link, as before.
        try {
          const certRes = await certResponse;
          if (certRes?.ok) {
            const certJson = (await certRes.json()) as {
              data?: {
                course?: unknown;
                id?: unknown;
                certificateNumber?: unknown;
              }[];
            };
            const match = (certJson.data ?? []).find(
              (entry) => entry.course === courseTitle,
            );
            // Prefer the human-readable certificate number for the URL; the
            // cuid id still resolves through the same page as a fallback.
            const certLink =
              typeof match?.certificateNumber === "string" &&
              match.certificateNumber
                ? match.certificateNumber
                : typeof match?.id === "string"
                  ? match.id
                  : null;
            if (certLink) setCertificateId(certLink);
          }
        } catch {
          // Certificate link stays hidden.
        }

        // Restore the lesson the user was last watching. Falls back to the
        // first free preview, then the first accessible lesson.
        const accessible = loadedModules
          .flatMap((m: Module) => m.lessons)
          .filter((l: Lesson) => lessonsData.isEnrolled || l.isFree);
        setSelectedLesson((current) => {
          try {
            const savedId = window.sessionStorage.getItem(
              `propycoder-course-lesson:${courseId}`,
            );
            if (savedId) {
              const saved = accessible.find((l: Lesson) => l.id === savedId);
              if (saved) return saved;
            }
          } catch {
            // Storage unavailable.
          }
          if (
            current &&
            accessible.some((l: Lesson) => l.id === current.id)
          ) {
            return current;
          }
          const firstFree = loadedModules
            .flatMap((m: Module) => m.lessons)
            .find((l: Lesson) => l.isFree && l.videoId);
          return firstFree ?? accessible[0] ?? null;
        });
      }
      if (!lessonsData) {
        // The ownership request failed or timed out. Resolve to the safe
        // locked/unenrolled state rather than keeping the whole page blocked.
        setIsEnrolled(false);
        setAccessResolvedCourseId(courseId);
      }
    } catch {
      // Gatekeeper: a failure BEFORE the gating course response settled
      // (e.g. the inner try never ran, or `setCourse` itself threw).
      // The inner finally normally clears the spinner; this is the last
      // safety net so the page can still render its not-found state.
      setIsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (!courseId) return;
    // If the first paint was primed from cache, course/modules already read
    // from localStorage; run the network fetch without showing the blocker.
    // Otherwise (true first visit) keep the spinner until data lands.
    if (course) setIsLoading(false);
    void loadCourse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, loadCourse]);

  // Remember the last-watched lesson so switching away (e.g. to the lab) and
  // coming back resumes on the same video instead of the first one.
  useEffect(() => {
    if (!courseId || !selectedLesson) return;
    try {
      window.sessionStorage.setItem(
        `propycoder-course-lesson:${courseId}`,
        selectedLesson.id,
      );
    } catch {
      // Storage unavailable.
    }
  }, [courseId, selectedLesson]);

  // Save the exact scroll position per course. Listen in capture phase as well,
  // because scroll events from nested overflow containers do not bubble normally.
  useEffect(() => {
    if (!courseId) return;
    const storageKey = `propycoder-course-scroll:${courseId}`;
    let frame = 0;

    const persist = () => {
      frame = 0;
      if (isRestoringScroll.current) return;
      try {
        const target = getCourseScrollTarget();
        window.sessionStorage.setItem(
          storageKey,
          String(readCourseScrollPosition(target)),
        );
      } catch {
        // Storage unavailable.
      }
    };

    const onScroll = () => {
      if (isRestoringScroll.current || frame) return;
      frame = window.requestAnimationFrame(persist);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("pagehide", persist);

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("pagehide", persist);
      if (frame) window.cancelAnimationFrame(frame);

      // Save the last non-zero position before route unmount/navigation.
      if (!isRestoringScroll.current) {
        try {
          const current = readCourseScrollPosition(getCourseScrollTarget());
          if (current > 0) window.sessionStorage.setItem(storageKey, String(current));
        } catch {
          // Storage unavailable.
        }
      }
    };
  }, [courseId]);

  // Restore after navigation/refresh. Re-detect the scroll surface on every
  // retry because the actual container may not be scrollable on the first paint.
  useEffect(() => {
    if (!courseId) return;

    const storageKey = `propycoder-course-scroll:${courseId}`;
    let saved = 0;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      saved = raw === null ? 0 : Number(raw);
    } catch {
      // Storage unavailable.
    }
    if (!Number.isFinite(saved) || saved <= 0) return;

    let stopped = false;
    let timeoutId: number | undefined;
    const startedAt = Date.now();
    isRestoringScroll.current = true;

    const finish = () => {
      if (stopped) return;
      stopped = true;
      isRestoringScroll.current = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      observer?.disconnect();
      resizeObserver?.disconnect();
    };

    const tick = () => {
      if (stopped) return;
      const target = getCourseScrollTarget();
      writeCourseScrollPosition(target, saved);
      const position = readCourseScrollPosition(target);
      const enoughContent = isWindowScrollTarget(target)
        ? document.documentElement.scrollHeight >= saved + window.innerHeight
        : target.scrollHeight >= saved + target.clientHeight;

      if (Math.abs(position - saved) <= 2 && enoughContent) {
        // Let one more frame pass so late layout shifts can settle.
        timeoutId = window.setTimeout(() => {
          if (stopped) return;
          const currentTarget = getCourseScrollTarget();
          const currentPosition = readCourseScrollPosition(currentTarget);
          if (Math.abs(currentPosition - saved) > 2) {
            tick();
          } else {
            finish();
          }
        }, 150);
        return;
      }

      if (Date.now() - startedAt >= 10000) {
        writeCourseScrollPosition(getCourseScrollTarget(), saved);
        finish();
        return;
      }
      timeoutId = window.setTimeout(tick, 100);
    };

    const observer = typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => tick())
      : null;
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => tick())
      : null;
    observer?.observe(document.documentElement, { childList: true, subtree: true });
    // ResizeObserver.observe accepts an Element. Observe the detected element
    // when it is an HTMLElement; otherwise observe the document root for window scrolling.
    const detectedTarget = getCourseScrollTarget();
    const resizeTarget: Element = detectedTarget instanceof HTMLElement
      ? detectedTarget
      : document.documentElement;
    resizeObserver?.observe(resizeTarget);

    window.requestAnimationFrame(() => window.requestAnimationFrame(tick));
    const onPageshow = () => {
      if (document.visibilityState === "visible") tick();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("pageshow", onPageshow);
    window.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      finish();
      window.removeEventListener("pageshow", onPageshow);
      window.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [courseId]);

  const handleEnroll = async () => {
    if (!session?.user) {
      router.push("/auth/login");
      return;
    }

    setIsEnrolling(true);
    try {
      // Free courses enroll directly; paid courses go through the payment
      // API, which sends the user to checkout and creates the enrollment
      // once the order completes.
      if (course?.price === 0) {
        const response = await fetch("/api/enrollments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId }),
        });

        if (response.ok) {
          toast.success("Successfully enrolled in course!");
          setIsEnrolled(true);
          router.push("/dashboard");
        } else {
          const error = await response.json();
          toast.error(error.error || "Failed to enroll");
        }
        return;
      }

      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });

      const payload = await response.json();

      if (response.ok) {
        if (payload.checkoutUrl) {
          // Client-side navigation (same as the bundles page): the checkout
          // mounts in the running app with the session already in memory, so
          // it renders after ONE payment fetch. `window.location.href` burned
          // the whole SPA + Router Cache on a full reload, making the
          // checkout slow and Back-from-checkout a full document reload.
          router.push(payload.checkoutUrl);
          return;
        }
        // No gateway configured (e.g. free course) ÔÇö we are already enrolled.
        toast.success("Successfully enrolled in course!");
        setIsEnrolled(true);
        router.push("/dashboard");
      } else {
        toast.error(payload.error || "Failed to start checkout");
      }
    } catch {
      toast.error("An error occurred while starting checkout");
    } finally {
      setIsEnrolling(false);
    }
  };

  // Mobile: the player is rendered inline in the curriculum, directly
  // beneath the tapped topic ÔÇö not pinned above/below the whole list.
  // Breakpoint must match the 740px layout rules in globals.css.
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 740px)");
    const sync = () => setIsMobileViewport(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const handleMarkComplete = async () => {
    if (!session?.user || !isEnrolled || !selectedLesson) return;
    setIsMarkingComplete(true);
    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: selectedLesson.id,
          status: "COMPLETED",
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Could not save lesson progress");
      }
      setCompletedLessonIds((current) =>
        new Set(current).add(selectedLesson.id),
      );
      toast.success("Lesson marked complete");

      // If this completion finished the course, a certificate was issued
      // server-side ÔÇö fetch it so the certificate card unlocks right away.
      const willComplete =
        !completedLessonIds.has(selectedLesson.id) &&
        totalLessons > 0 &&
        completedLessonIds.size + 1 >= totalLessons;
      if (willComplete) {
        try {
          const certResponse = await fetch("/api/certificates");
          if (certResponse.ok) {
            const certData = await certResponse.json();
            const match = (certData.data ?? []).find(
              (entry: { course: string }) => entry.course === course?.title,
            ) as
              | { certificateNumber?: unknown; id?: unknown }
              | undefined;
            const certLink =
              typeof match?.certificateNumber === "string" &&
              match.certificateNumber
                ? match.certificateNumber
                : typeof match?.id === "string"
                  ? match.id
                  : null;
            if (certLink) setCertificateId(certLink);
          }
        } catch {
          // Ignore ÔÇö the card will appear on next load.
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save progress",
      );
    } finally {
      setIsMarkingComplete(false);
    }
  };

  // The lesson player is rendered in exactly one place at a time:
  // side column on desktop, inline beneath the selected topic on mobile.
  const lessonPlayer =
    selectedLesson && (isEnrolled || selectedLesson.isFree) ? (
      <div className="course-lesson-player">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          {selectedLesson.title}
        </h3>
        {selectedLesson.videoId ? (
          <LessonVideoPlayer
            key={selectedLesson.id}
            lessonId={selectedLesson.id}
            videoId={selectedLesson.videoId}
            title={selectedLesson.title}
          />
        ) : (
          <div className="course-no-video">
            Lesson materials are available in the lesson description.
          </div>
        )}
        {selectedLesson.description && (
          <p className="mt-4 text-gray-600">{selectedLesson.description}</p>
        )}
        {isEnrolled && (
          <button
            type="button"
            className="course-complete-button"
            disabled={
              isMarkingComplete || completedLessonIds.has(selectedLesson.id)
            }
            onClick={handleMarkComplete}
          >
            <CheckCircle size={16} />
            {completedLessonIds.has(selectedLesson.id)
              ? "Lesson completed"
              : isMarkingComplete
                ? "Saving progress..."
                : "Mark lesson complete"}
          </button>
        )}
      </div>
    ) : null;

  if (isLoading) {
    return (
      <div className="course-detail-page">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#e95f32] border-t-transparent"></div>
        </div>
      </div>
    );
  }

  const isAccessLoading =
    status === "loading" ||
    (status === "authenticated" && accessResolvedCourseId !== courseId);

  if (!course || isAccessLoading) {
    return (
      <div className="course-detail-page">
        <Navbar />
      </div>
    );
  }

  return (
    <div className="course-detail-page">
      <Navbar />

      <main className="course-detail-shell">
        <div className="course-breadcrumb">
          <button
            type="button"
            className="course-back-button"
            onClick={() =>  router.push("/courses")}
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <Link href="/courses">Courses</Link>
          <span>/</span>
          {course.category}
        </div>
        {/* Course Header */}
        <div className="course-detail-grid">
          <div className="course-detail-main">
            <div
              className="course-detail-cover"
              role="img"
              aria-label={`${course.title} course artwork`}
              style={
                course.image
                  ? {
                      backgroundImage: `url("${course.image}")`, //linear-gradient(90deg, rgba(24, 24, 27, .72), rgba(24, 24, 27, .08)),
                    }
                  : undefined
              }
            >
              {
                !course.image
                  ? (
                    <>
              <span>{course.category}</span>
              
              <BookOpen size={44} /> 
              <strong>LEARN BY BUILDING</strong> </>) :<></> }
            </div>

            <div className="course-overview-card">
              <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold mb-3">
                {course.level}
              </span>
              <h1 className="course-detail-title">{course.title}</h1>
              <p className="course-detail-description">{course.description}</p>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-6 border-y border-gray-200">
                <div>
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm">Duration</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">
                    {course.duration}h
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <Users className="h-4 w-4" />
                    <span className="text-sm">Enrolled</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">
                    {course._count.enrollments}
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <BookOpen className="h-4 w-4" />
                    <span className="text-sm">Modules</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">
                    {course.modules.length}
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <Award className="h-4 w-4" />
                    <span className="text-sm">Level</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">
                    {course.level}
                  </p>
                </div>
              </div>

              
            </div>
          </div>

          {/* Pricing & enrollment ÔÇö beside the cover/overview/instructor,
              non-sticky so it scrolls away with the page */}
          <div className="course-detail-sidebar">
            <div className="course-purchase-card">
                <div className="mb-6">
                  {course.price > 0 ? (
                    <div className="mb-2">
                      <PriceTag
                        price={course.price}
                        offerPrice={course.offerPrice ?? null}
                        size="lg"
                      />
                    </div>
                  ) : (
                    <div className="text-2xl font-bold text-sky-600 mb-2">
                      Free
                    </div>
                  )}
                  {course.offerPrice !== null &&
                    course.offerPrice !== undefined &&
                    course.offerPrice > 0 &&
                    course.offerPrice < course.price && (
                      <p className="text-sm font-medium text-emerald-600">
                        You save {formatINR(course.price - course.offerPrice)}
                      </p>
                    )}
                </div>

                <button
                  onClick={handleEnroll}
                  disabled={isEnrolling || isEnrolled}
                  className={`w-full py-3 rounded-lg font-semibold text-lg transition flex items-center justify-center gap-2 ${
                    isEnrolled
                      ? "bg-sky-600 text-white cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  } ${isEnrolling ? "opacity-50" : ""}`}
                >
                  {isEnrolled ? (
                    <>
                      <CheckCircle className="h-5 w-5" />
                      Enrolled
                    </>
                  ) : course.price > 0 ? (
                    <>
                      <CreditCard className="h-5 w-5" />
                      Buy now
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-5 w-5" />
                      Enroll Free
                    </>
                  )}
                </button>

                {course.price > 0 && !isEnrolled && (
                  <p className="text-sm text-gray-500 text-center mt-3">
                    Pay securely at checkout, then start learning instantly.
                  </p>
                )}

                <div className="mt-5 space-y-3">
                  <h4 className="font-semibold text-gray-900">
                    This course includes:
                  </h4>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="h-4 w-4" />
                    <span>{course.duration} hours total</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <PlayCircle className="h-4 w-4" />
                    <span>Video lessons</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Award className="h-4 w-4" />
                    <span>Certificate of completion</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="h-4 w-4" />
                    <span>Lifetime access</span>
                  </div>
                </div>
                
                {/* Instructor */}
              <div className="mt-6">
                <h2 className="text-lg font-bold text-gray-900 mb-3">
                  Instructor
                </h2>
                <div className="flex items-center gap-3">
                  {course.instructor.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={course.instructor.avatar}
                      alt={`${course.instructor.firstName} ${course.instructor.lastName}`}
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="bg-blue-100 w-10 h-10 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-bold">
                        {course.instructor.firstName[0]}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-gray-900">
                      {course.instructor.firstName} {course.instructor.lastName}
                    </p>
                    <p className="text-sm text-gray-600">Expert Instructor</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Curriculum (left) + video player (right) ÔÇö full-width row */}
          <div className="course-learning-grid">
            <div className="course-curriculum">
              {/* Live classes ÔÇö upcoming/running sessions for this course */}
              {liveClasses.length > 0 && (
                <div className="course-live">
                  <div className="course-live-head">
                    <Radio size={16} />
                    <h3>Live classes</h3>
                  </div>
                  <div className="course-live-list">
                    {liveClasses.map((item) => {
                      const status = effectiveStatus({
                        status: item.storedStatus ?? item.status,
                        startsAt: item.startsAt,
                        endsAt: item.endsAt,
                      });
                      const start = new Date(item.startsAt);
                      const end = new Date(item.endsAt);
                      const isStaff =
                        session?.user?.id === course?.instructor.id;
                      const canJoin =
                        Boolean(item.meetingUrl) &&
                        (isEnrolled || isStaff) &&
                        (status === "SCHEDULED" || status === "LIVE");
                      return (
                        <div
                          key={item.id}
                          className={`course-live-row is-${status.toLowerCase()}`}
                        >
                          <div className="course-live-when mt-2">
                            <strong>
                              {start.toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                            </strong>
                            <span>
                              {start.toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {" - "}
                              {end.toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                             <p className="text-xs">
                              {PROVIDER_LABELS[item.provider] ?? item.provider}
                              </p>
                          </div>
                          <div className="course-live-copy">
                            <div>
                              <h4>{item.title}</h4>
                              <span
                                className={`live-pill is-${status.toLowerCase()}`}
                              >
                                {status === "LIVE" && (
                                  <span className="live-pill-dot" />
                                )}
                                {STATUS_LABELS[status]}
                              </span>
                            </div>
                            <p className="ps-3">
                              
                              {item.description
                                ? `${item.description}`
                                : ""}
                            </p>
                          </div>
                          {canJoin ? (
                            <a
                              className="course-live-join"
                              href={item.meetingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Join
                            </a>
                          ) : status === "SCHEDULED" || status === "LIVE" ? (
                            <span className="course-live-join is-locked">
                              Enroll to join
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="course-curriculum-heading">
                <div>
                  <span>WHAT YOU WILL LEARN</span>
                  <h2>Course curriculum</h2>
                </div>
                {isEnrolled && (
                  <span className="course-completion-count">
                    {completedLessons}/{totalLessons} lessons complete
                  </span>
                )}
              </div>

              {modules.length > 0 ? (
                <div className="space-y-4">
                  {modules.map((module, moduleIndex) => (
                    <div key={module.id} className="course-module">
                      <div className="course-module-heading">
                        <h3>
                          Module {moduleIndex + 1}: {module.title}
                        </h3>
                      </div>
                      <div className="course-lesson-list">
                        {module.lessons.map((lesson) => (
                          <Fragment key={lesson.id}>
                          <button
                            type="button"
                            className={`course-lesson-row ${
                              selectedLesson?.id === lesson.id
                                ? "is-selected"
                                : ""
                            }`}
                            onClick={() => {
                              if (isEnrolled || lesson.isFree) {
                                setSelectedLesson(lesson);
                              } else {
                                toast.error(
                                  "Enroll in the course to access this lesson",
                                );
                              }
                            }}
                          >
                            <div className="flex items-center gap-3">
                              {completedLessonIds.has(lesson.id) ? (
                                <CheckCircle className="h-5 w-5 text-sky-600" />
                              ) : isEnrolled || lesson.isFree ? (
                                lesson.videoId ? (
                                  <Video className="h-5 w-5 text-red-600" />
                                ) : (
                                  <PlayCircle className="h-5 w-5 text-blue-600" />
                                )
                              ) : (
                                <Lock className="h-5 w-5 text-gray-400" />
                              )}
                              <div>
                                <p className="font-medium text-gray-900">
                                  {lesson.title}
                                </p>
                                {lesson.duration && (
                                  <p className="text-sm text-gray-500">
                                    {lesson.duration} min
                                  </p>
                                )}
                              </div>
                            </div>
                            {lesson.isFree && !isEnrolled && (
                              <span className="text-xs bg-sky-100 text-sky-800 px-2 py-1 rounded">
                                Free Preview
                              </span>
                            )}
                          </button>
                          {/* Mobile: video opens right below the tapped topic */}
                          {isMobileViewport &&
                            selectedLesson?.id === lesson.id &&
                            lessonPlayer && (
                              <div className="course-lesson-inline-player">
                                {lessonPlayer}
                              </div>
                            )}
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                  {/* Certificate ÔÇö locked until the course is 100% complete */}
                {
                  <div className="mt-2">
                    {certificateId ? (
                      <Link
                        href={`/certificates/${certificateId}`}
                        className="course-certificate-card is-unlocked"
                      >
                        <Award className="h-6 w-6 shrink-0" />
                        <span>
                          <strong>Certificate earned!</strong>
                          <small>View and download your certificate</small>
                        </span>
                      </Link>
                    ) : (
                      <div className="course-certificate-card is-locked">
                        <Lock className="h-5 w-5 shrink-0" />
                        <span>
                          <strong>Certificate</strong>
                          <small>
                            {totalLessons > 0 &&
                            completedLessons >= totalLessons
                              ? "Unlocking..."
                              : `Complete all ${totalLessons} lessons to unlock your certificate`}
                          </small>
                        </span>
                      </div>
                    )}
                  </div>
                }
                </div>
                
              ) : (
                <p className="text-gray-500 text-center py-8">
                  Course curriculum will be available soon.
                </p>
              )}
              
            </div>

            {/* Video Player ÔÇö desktop only; mobile renders the same
                player inline directly beneath the tapped topic. */}
            {!isMobileViewport && lessonPlayer}
          </div>
        </div>
      </main>
    </div>
  );
}
