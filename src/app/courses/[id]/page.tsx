"use client";

import {
  Fragment,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { PriceTag } from "@/components/price-tag";
import { formatINR } from "@/lib/currency";
import { businessInfo } from "@/lib/business-info";
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
import {
  primeResourceCache,
  readResourceCache,
} from "@/lib/use-resource";
import {
  PROVIDER_LABELS,
  STATUS_LABELS,
  effectiveStatus,
} from "@/lib/live-classes";

const LessonVideoPlayer = dynamic(
  () =>
    import("@/components/lesson-video-player").then(
      (module) => module.LessonVideoPlayer,
    ),
  {
    loading: () => (
      <div className="course-player-loading" role="status">
        Loading video player...
      </div>
    ),
  },
);

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  order: number;
  videoUrl: string | null;
  videoId: string | null;
  videoStartTime: number | null;
  videoEndTime: number | null;
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

interface CachedCourseAccess {
  isEnrolled: boolean;
  modules: Module[];
  completedLessonIds?: string[];
  certificateId?: string | null;
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

  // If the document itself scrolls, that is the surface. Checking this first
  // stops a small inner overflow box (table, code block, horizontal scroller)
  // from being mistaken for the page scroller.
  const root = document.scrollingElement ?? document.documentElement;
  const rootLocked = [document.documentElement, document.body].some(
    (el) => window.getComputedStyle(el).overflowY === "hidden",
  );
  if (!rootLocked && root.scrollHeight > root.clientHeight + 1) return window;

  // Otherwise prefer a scrollable ancestor of the course page.
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

function readAuthUserHint(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem("propycoder-auth-user-id");
  } catch {
    return null;
  }
}

function formatStartsIn(startTime: number, now: number): string {
  const minutesUntil = Math.max(1, Math.ceil((startTime - now) / 60_000));
  const hours = Math.floor(minutesUntil / 60);
  const minutes = minutesUntil % 60;
  const parts = [
    hours > 0 ? `${hours} hr${hours === 1 ? "" : "s"}` : "",
    minutes > 0 ? `${minutes} min${minutes === 1 ? "" : "s"}` : "",
  ].filter(Boolean);

  return `Starts in ${parts.join(" ")}`;
}

export default function CourseDetailPage({ params }: Props) {
  const { id: courseId } = use(params);
  const { data: session, status, update: updateSession } = useSession();
  const sessionUserId = session?.user?.id ?? null;
  const authUserHint = status === "loading" ? readAuthUserHint() : null;
  const cacheUserId = sessionUserId ?? authUserHint;
  const accessCacheKey = `course-access:${courseId}`;
  const accessCacheScope = cacheUserId ? `user:${cacheUserId}` : "public";
  const router = useRouter();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [courseLoadError, setCourseLoadError] = useState<string | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [accessResolvedCourseId, setAccessResolvedCourseId] = useState("");
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(
    new Set(),
  );
  const [showProductDescription, setShowProductDescription] = useState(false);
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);
  const isRestoringScroll = useRef(false);
  const lastInitialLoadKey = useRef("");
  const [certificateId, setCertificateId] = useState<string | null>(null);
  const [liveClasses, setLiveClasses] = useState<LiveClassItem[]>([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (liveClasses.length === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [liveClasses.length]);

  const totalLessons = modules.reduce(
    (total, module) => total + module.lessons.length,
    0,
  );
  const completedLessons = completedLessonIds.size;

  // Restore scroll as soon as the course shell is visible; private enrollment
  // checks can finish in the background without hiding the cached page.
  const contentReady =
    !isLoading &&
    !!course &&
    course.id === courseId;

  useLayoutEffect(() => {
    const restore = () => {
      const cachedCourse = readResourceCache<CourseDetail>(
        "course-detail",
        `public:${courseId}`,
      );
      const cachedAccess = readResourceCache<CachedCourseAccess>(
        accessCacheKey,
        accessCacheScope,
      );
      if (cachedCourse) {
        setCourse({ ...cachedCourse, modules: cachedCourse.modules ?? [] });
        setIsLoading(false);
      } else {
        setCourse(null);
        setIsLoading(true);
      }
      if (cachedAccess && (sessionUserId || !cachedAccess.isEnrolled)) {
        setModules(cachedAccess.modules);
        setIsEnrolled(cachedAccess.isEnrolled);
        setAccessResolvedCourseId(courseId);
        setCompletedLessonIds(
          new Set(cachedAccess.completedLessonIds ?? []),
        );
        setCertificateId(cachedAccess.certificateId ?? null);
        const accessible = cachedAccess.modules
          .flatMap((module) => module.lessons)
          .filter((lesson) => cachedAccess.isEnrolled || lesson.isFree);
        let savedLessonId: string | null = null;
        try {
          savedLessonId = window.sessionStorage.getItem(
            `propycoder-course-lesson:${courseId}`,
          );
        } catch {
          // Storage unavailable.
        }
        setSelectedLesson(
          accessible.find((lesson) => lesson.id === savedLessonId) ??
            accessible.find((lesson) => lesson.isFree && lesson.videoId) ??
            accessible[0] ??
            null,
        );
      } else if (cachedAccess && status === "loading" && authUserHint) {
        setModules([]);
        setIsEnrolled(cachedAccess.isEnrolled);
        setAccessResolvedCourseId(courseId);
        setSelectedLesson(null);
        setCompletedLessonIds(new Set());
        setCertificateId(null);
      } else {
        setModules([]);
        setIsEnrolled(false);
        setAccessResolvedCourseId("");
        setSelectedLesson(null);
        setCompletedLessonIds(new Set());
        setCertificateId(null);
      }
      try {
        window.sessionStorage.setItem("propycoder-last-course", courseId);
      } catch {
        // Storage unavailable.
      }
    };

    restore();
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, [
    accessCacheKey,
    accessCacheScope,
    authUserHint,
    courseId,
    sessionUserId,
    status,
  ]);

  // Use the authenticated endpoint for enrolled users/staff (which can expose
  // the join URL), and the public-safe listing for signed-out/non-enrolled
  // visitors (which never contains meeting credentials).
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
          : await fetch("/api/live-classes?scope=public");
        let responseContainsCredentials = Boolean(sessionUserId);
        // A signed-in visitor who hasn't enrolled should still see the public
        // schedule, but must not receive the protected meeting credentials.
        if (sessionUserId && response.status === 403) {
          response = await fetch("/api/live-classes?scope=public");
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
    setCourseLoadError(null);
    try {
      // Fetch course details and access-controlled lessons in parallel.
      // Course first paint wins here: the spinner gates ONLY on the
      // course payload settled in the inner try block below.
      const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const [courseRequest, lessonsRequest] = [
        fetch(`/api/courses/${courseId}`, { signal }),
        fetch(`/api/lessons?courseId=${encodeURIComponent(courseId)}`, {
          signal,
        }),
      ];
      const lessonsResponse = settle(lessonsRequest);

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

        setCourse({ ...data, modules: data.modules ?? [] });
        setCourseLoadError(null);
        // Cache for instant first paint on the next visit (paint-first from
        // localStorage, then this background fetch patches what changed).
        primeResourceCache<CourseDetail>(
          "course-detail",
          `public:${courseId}`,
          data,
        );
        // Remember this course so the navbar "Courses" tab can return
        // here (lab -> courses switch) instead of always showing the list.
        try {
          window.sessionStorage.setItem("propycoder-last-course", courseId);
        } catch {
          // Storage unavailable.
        }
      } catch {
        // The gating request failed or timed out: fall through to the
        // finally below, which clears the spinner so the page renders its
        // not-found state instead of spinning forever.
        setCourseLoadError("We couldn't load this course right now.");
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
        const enrolled = lessonsData.isEnrolled ?? false;
        setModules(loadedModules);
        setIsEnrolled(enrolled);
        setAccessResolvedCourseId(courseId);
        if (!enrolled) {
          setCompletedLessonIds(new Set());
          setCertificateId(null);
        }

        // Restore the lesson the user was last watching. Falls back to the
        // first free preview, then the first accessible lesson.
        const accessible = loadedModules
          .flatMap((module) => module.lessons)
          .filter((lesson) => enrolled || lesson.isFree);
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
            return accessible.find((l: Lesson) => l.id === current.id) ?? current;
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
      setCourseLoadError("We couldn't load this course right now.");
      setIsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
  if (!courseId) return;

  const initialLoadKey = `${courseId}:${cacheUserId ?? "unknown"}`;

  if (lastInitialLoadKey.current !== initialLoadKey) {
    lastInitialLoadKey.current = initialLoadKey;

    if (course?.id === courseId) {
      setIsLoading(false);
    }

    void loadCourse();
  }

  // Prevent duplicate requests when focus and visibility events
  // fire almost simultaneously.
     let lastRevalidationAt = 0;

  const revalidate = () => {
    if (document.visibilityState !== "visible") return;

    const now = Date.now();

    if (now - lastRevalidationAt < 30_000) return;

    lastRevalidationAt = now;
    void loadCourse();
  };

  window.addEventListener("focus", revalidate);
  window.addEventListener("pageshow", revalidate);
  document.addEventListener("visibilitychange", revalidate);

  return () => {
    window.removeEventListener("focus", revalidate);
    window.removeEventListener("pageshow", revalidate);
    document.removeEventListener("visibilitychange", revalidate);
  };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheUserId, courseId, loadCourse]);

  useEffect(() => {
    if (
      accessResolvedCourseId !== courseId ||
      (isEnrolled && !sessionUserId)
    ) {
      return;
    }
    primeResourceCache<CachedCourseAccess>(
      accessCacheKey,
      sessionUserId ? `user:${sessionUserId}` : "public",
      {
        modules,
        isEnrolled,
        completedLessonIds: Array.from(completedLessonIds),
        certificateId,
      },
    );
  }, [
    accessCacheKey,
    accessResolvedCourseId,
    certificateId,
    completedLessonIds,
    courseId,
    isEnrolled,
    modules,
    sessionUserId,
  ]);

  useEffect(() => {
    if (
      accessResolvedCourseId !== courseId ||
      !sessionUserId ||
      !isEnrolled
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/progress?courseId=${encodeURIComponent(courseId)}`,
          { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
        );
        if (!response.ok || cancelled) return;
        const progressJson = (await response.json()) as {
          data?: unknown;
          certificateNumber?: unknown;
        };
        if (!Array.isArray(progressJson.data) || cancelled) return;
        const completedIds = (
          progressJson.data as { lessonId?: unknown; status?: string }[]
        )
          .filter((item) => item.status === "COMPLETED")
          .map((item) => item.lessonId)
          .filter(
            (lessonId): lessonId is string =>
              typeof lessonId === "string",
          );
        setCompletedLessonIds(new Set(completedIds));
        setCertificateId(
          typeof progressJson.certificateNumber === "string"
            ? progressJson.certificateNumber
            : null,
        );
      } catch {
        // Progress is optional for rendering the course page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessResolvedCourseId, courseId, isEnrolled, sessionUserId]);

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

  // SAVE: only once content is ready, so layout collapse during loading can
  // never write a bogus 0. Saved on every (rAF-throttled) scroll, so there is
  // no need to read the position at unmount time, when the DOM is already gone.
  useEffect(() => {
    if (!courseId || !contentReady) return;
    const storageKey = `propycoder-course-scroll:${courseId}`;
    let frame = 0;

    // Real user scrolling input. Used to tell a genuine "scrolled back to the
    // top" apart from the router's automatic scroll-to-top on navigation,
    // which must never overwrite the saved position with 0.
    let lastUserScrollInput = 0;
    const markUserInput = () => {
      lastUserScrollInput = Date.now();
    };

    const persist = () => {
      frame = 0;
      if (isRestoringScroll.current) return;
      try {
        const position = readCourseScrollPosition(getCourseScrollTarget());
        if (position <= 0 && Date.now() - lastUserScrollInput > 1000) return;
        window.sessionStorage.setItem(storageKey, String(position));
      } catch {
        // Storage unavailable.
      }
    };
    const onScroll = () => {
      if (isRestoringScroll.current || frame) return;
      frame = window.requestAnimationFrame(persist);
    };

    const inputEvents = ["wheel", "touchmove", "keydown"] as const;
    inputEvents.forEach((e) =>
      window.addEventListener(e, markUserInput, { passive: true }),
    );
    window.addEventListener("scroll", onScroll, { passive: true });
    // Capture phase: nested overflow containers don't bubble scroll events.
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("pagehide", persist);
    return () => {
      inputEvents.forEach((e) => window.removeEventListener(e, markUserInput));
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("pagehide", persist);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [courseId, contentReady]);

  // RESTORE: runs once, only after content is ready. Gives up after 3s, and
  // stops immediately on any user input so it can never fight the user.
  useEffect(() => {
    if (!courseId || !contentReady) return;
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
    let settleTimer: number | undefined;
    const startedAt = Date.now();
    isRestoringScroll.current = true;

    const maxScroll = (t: CourseScrollTarget) =>
      isWindowScrollTarget(t)
        ? document.documentElement.scrollHeight - window.innerHeight
        : t.scrollHeight - t.clientHeight;

    const userEvents = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      isRestoringScroll.current = false;
      if (interval !== undefined) window.clearInterval(interval);
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      resizeObserver?.disconnect();
      userEvents.forEach((e) => window.removeEventListener(e, stop));
    };

    const attempt = () => {
      if (stopped || settleTimer !== undefined) return;
      const target = getCourseScrollTarget();
      const reachable = maxScroll(target) >= saved - 2;
      const timedOut = Date.now() - startedAt >= 3000;
      if (!reachable && !timedOut) return; // content still growing

      writeCourseScrollPosition(
        target,
        Math.min(saved, Math.max(0, maxScroll(target))),
      );
      // One final correction after late layout shifts (video player etc.), then stop.
      settleTimer = window.setTimeout(() => {
        if (stopped) return;
        const t = getCourseScrollTarget();
        if (
          Math.abs(readCourseScrollPosition(t) - saved) > 2 &&
          maxScroll(t) >= saved - 2
        ) {
          writeCourseScrollPosition(t, saved);
        }
        stop();
      }, 250);
    };

    userEvents.forEach((e) => window.addEventListener(e, stop, { passive: true }));
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(attempt) : null;
    resizeObserver?.observe(document.body);
    const interval = window.setInterval(attempt, 100);
    window.requestAnimationFrame(attempt);

    return stop;
  }, [courseId, contentReady]);

  const handleEnroll = async () => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }

    setIsEnrolling(true);
    try {
      const currentSession =
        status === "loading" ? await updateSession() : session;
      if (!currentSession?.user) {
        router.push("/auth/login");
        return;
      }

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
          if (error.error === "Already enrolled in this course") {
            setIsEnrolled(true);
            setAccessResolvedCourseId(courseId);
            return;
          }
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
        // No gateway configured (e.g. free course) - we are already enrolled.
        toast.success("Successfully enrolled in course!");
        setIsEnrolled(true);
        router.push("/dashboard");
      } else {
        if (payload.error === "Already enrolled in this course") {
          setIsEnrolled(true);
          setAccessResolvedCourseId(courseId);
          return;
        }
        toast.error(payload.error || "Failed to start checkout");
      }
    } catch {
      toast.error("An error occurred while starting checkout");
    } finally {
      setIsEnrolling(false);
    }
  };

  // Mobile: the player is rendered inline in the curriculum, directly
  // beneath the tapped topic - not pinned above/below the whole list.
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
      const progressResult = (await response.json()) as {
        certificateNumber?: unknown;
      };
      const nextCompletedLessonIds = new Set(completedLessonIds);
      nextCompletedLessonIds.add(selectedLesson.id);
      setCompletedLessonIds(nextCompletedLessonIds);
      toast.success("Lesson marked complete");

      const nextCertificateId =
        typeof progressResult.certificateNumber === "string"
          ? progressResult.certificateNumber
          : certificateId;
      if (nextCertificateId !== certificateId) {
        setCertificateId(nextCertificateId);
      }
      primeResourceCache<CachedCourseAccess>(
        accessCacheKey,
        accessCacheScope,
        {
          modules,
          isEnrolled: true,
          completedLessonIds: Array.from(nextCompletedLessonIds),
          certificateId: nextCertificateId,
        },
      );

      if (typeof progressResult.certificateNumber === "string") {
        return;
      }

      // If this completion finished the course, a certificate was issued
      // server-side - fetch it so the certificate card unlocks right away.
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
            if (certLink) {
              setCertificateId(certLink);
              primeResourceCache<CachedCourseAccess>(
                accessCacheKey,
                accessCacheScope,
                {
                  modules,
                  isEnrolled: true,
                  completedLessonIds: Array.from(nextCompletedLessonIds),
                  certificateId: certLink,
                },
              );
            }
          }
        } catch {
          // Ignore - the card will appear on next load.
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
        {selectedLesson.videoId || selectedLesson.videoUrl ? (
          <LessonVideoPlayer
            key={selectedLesson.id}
            lessonId={selectedLesson.id}
            videoId={selectedLesson.videoId}
            videoUrl={selectedLesson.videoUrl}
            videoStartTime={selectedLesson.videoStartTime}
            videoEndTime={selectedLesson.videoEndTime}
            durationMinutes={selectedLesson.duration}
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

  if (isLoading || (course !== null && course.id !== courseId)) {
    return (
      <div className="course-detail-page">
        <Navbar />
        <main
          className="course-detail-shell"
          aria-label="Loading course"
          aria-busy="true"
        >
          <div className="skeleton-block skeleton-line" />
          <div className="skeleton-detail-grid">
            <div className="skeleton-block skeleton-detail-main" />
            <div className="skeleton-block skeleton-detail-side" />
          </div>
        </main>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="course-detail-page">
        <Navbar />
        <main className="course-detail-shell">
          <section className="course-load-error" role="alert">
            <h1>Course unavailable</h1>
            <p>
              {courseLoadError ??
                "This course could not be found or loaded right now."}
            </p>
            <div className="course-load-error-actions">
              <button
                type="button"
                className="live-action is-primary"
                onClick={() => {
                  setIsLoading(true);
                  void loadCourse();
                }}
              >
                Try again
              </button>
              <Link href="/courses" className="live-action">
                Back to courses
              </Link>
            </div>
          </section>
        </main>
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

          {/* Pricing & enrollment - beside the cover/overview/instructor,
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
                  <div
    className="course-common-description-toggle"
    onClick={() => setShowProductDescription(true)}
  >
    Read more →
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
{/* Live classes - upcoming/running sessions for this course */}
              {liveClasses.length > 0 && (
                <div className="course-live">
                  <div className="course-live-head">
                    <Radio size={16} />
                    <h3>Live classes</h3>
                  </div>
                  <div className="live-list">
                    {liveClasses.map((item) => {
                      const status = effectiveStatus({
                        status: item.storedStatus ?? item.status,
                        startsAt: item.startsAt,
                        endsAt: item.endsAt,
                      }, new Date(now));
                      const start = new Date(item.startsAt);
                      const end = new Date(item.endsAt);
                      const timeSummary =
                        status === "SCHEDULED"
                          ? formatStartsIn(start.getTime(), now)
                          : status === "LIVE"
                            ? `Ends at ${end.toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`
                            : `${start.toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })} · ${start.toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })} – ${end.toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`;
                      const isStaff =
                        session?.user?.id === course?.instructor.id;
                      const canJoin =
                        Boolean(item.meetingUrl) &&
                        (isEnrolled || isStaff) &&
                        (status === "SCHEDULED" || status === "LIVE");
                      return (
                        <article
                          key={item.id}
                          className={`live-row course-live-row is-${status.toLowerCase()}`}
                        >
                          <div className="live-row-date">
                            <span>
                              {start.toLocaleDateString(undefined, {
                                month: "short",
                              })}
                            </span>
                            <strong>
                              {start.toLocaleDateString(undefined, {
                                day: "numeric",
                              })}
                            </strong>
                            <small>
                              {start.toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </small>
                          </div>
                          <div className="live-row-content">
                            <div className="live-row-main">
                              <div className="live-row-title">
                                <h3>{item.title}</h3>
                                <span
                                  className={`live-pill is-${status.toLowerCase()}`}
                                >
                                  {status === "LIVE" && (
                                    <span className="live-pill-dot" />
                                  )}
                                  {STATUS_LABELS[status]}
                                </span>
                              </div>
                              <p className="live-row-meta">
                                {PROVIDER_LABELS[item.provider] ?? item.provider}
                                {" · "}{timeSummary}
                              </p>
                              {item.description && (
                                <p className="live-row-desc">
                                  {item.description}
                                </p>
                              )}
                            </div>
                            {(canJoin ||
                              status === "SCHEDULED" ||
                              status === "LIVE") && (
                              <div className="live-row-actions">
                                {canJoin ? (
                                  <a
                                    className="live-action is-primary"
                                    href={item.meetingUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Video size={14} /> Join class
                                  </a>
                                ) : (
                                  <span
                                    className="live-action is-locked"
                                    aria-disabled="true"
                                  >
                                    <Lock size={14} />
                                    {isEnrolled || isStaff
                                      ? "Join link unavailable"
                                      : "Enroll to join"}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
          {/* Curriculum (left) + video player (right) - full-width row */}
          <div className="course-learning-grid">
            <div className="course-curriculum">
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
                                !lesson.videoId ? (
                                  <Video className="h-5 w-5 text-red-600" />
                                ) : (
                                  <PlayCircle className="h-5 w-5 text-red-600" />
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
                  {/* Certificate - locked until the course is 100% complete */}
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

            {/* Video Player - desktop only; mobile renders the same
                player inline directly beneath the tapped topic. */}
            {!isMobileViewport && lessonPlayer}
          </div>
        </div>
      </main>
      

{showProductDescription && (
  <div
    className="fixed inset-0 z-99999 flex items-center justify-center
               bg-black/60 backdrop-blur-sm p-3 sm:p-5"
    onClick={() => setShowProductDescription(false)}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-description-title"
      className="flex flex-col w-full max-w-170 max-h-[85vh]
                 overflow-hidden rounded-md border border-gray-200
                 bg-white shadow-2xl dark:border-[#383838]
                 dark:bg-[#1e1e1e]"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4
                      border-b border-[#f55a26] px-5 py-2
                      shrink-0">

        <div>
          <span className="block text-[9px] font-bold
                           tracking-[1px] text-[#f55a26]">
            COURSE OVERVIEW
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowProductDescription(false)}
          aria-label="Close product description"
          className="flex shrink-0 items-center
                     justify-center rounded
                     text-xl hover:text-gray-500 transition
                      text-[#f55a26]
                      hover:dark:text-gray-400"
        >
          &times;
        </button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5
                      [scrollbar-width:thin]
                      [scrollbar-color:#f55a26_transparent]">

        <div className="text-xs font-normal leading-[1.65]
                        text-[#707070] dark:text-gray-300">
          {businessInfo.productsDescription
            ?.trim()
            .split(/\n\s*\n/)
            .filter((paragraph) => paragraph.trim())
            .map((paragraph, index) => {
              const content = paragraph.trim();

              const isHeading =
                content.endsWith(":") ||
                /^\d+\.\s/.test(content);

              return (
                <p
                  key={index}
                  className={`mb-2 text-xs ${
                    isHeading
                      ? "mt-3 mb-1 font-bold text-[#1f1f1f] dark:text-white"
                      : "font-normal"
                  }`}
                >
                  {content}
                </p>
              );
            })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 justify-end border-t
                      border-gray-200 px-5 py-3
                      dark:border-gray-700">
        <button
          type="button"
          onClick={() => setShowProductDescription(false)}
          className="rounded border border-[#f55a26]
                     bg-[#f55a26] px-5 py-2 text-xs
                     font-semibold text-white transition
                     hover:border-[#df491b] hover:bg-[#df491b]"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}


    </div>
  );
}
