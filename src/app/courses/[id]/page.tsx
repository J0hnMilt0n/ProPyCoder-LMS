"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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

// Use the actual scrolling surface. Some layouts scroll the window, while
// others place the course page inside an overflow-y container.
type CourseScrollTarget = Window | HTMLElement;

function getCourseScrollTarget(): CourseScrollTarget {
  let element = document.querySelector<HTMLElement>(".course-detail-page");
  while (element && element !== document.body) {
    const overflowY = window.getComputedStyle(element).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      element.scrollHeight > element.clientHeight + 1
    ) {
      return element;
    }
    element = element.parentElement;
  }
  return window;
}

function readCourseScrollPosition(target: CourseScrollTarget): number {
  return target === window ? window.scrollY : target.scrollTop;
}

function writeCourseScrollPosition(target: CourseScrollTarget, top: number): void {
  if (target === window) {
    window.scrollTo({ top, left: 0, behavior: "auto" });
  } else {
    target.scrollTo({ top, left: 0, behavior: "auto" });
  }
}

interface LiveClassItem {
  id: string;
  title: string;
  description: string | null;
  provider: string;
  meetingUrl: string;
  startsAt: string;
  endsAt: string;
  status: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
  storedStatus: string;
}

export default function CourseDetailPage({ params }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  // courseId from the pathname synchronously — the Promise<{id}> in params
  // resolves one tick later. Knowing it on the very first render lets us
  // prime cached course content immediately instead of waiting a round trip.
  const [courseId, setCourseId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const tail = window.location.pathname.split("/").filter(Boolean).pop();
    return tail && tail !== "courses" ? tail : "";
  });
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

  // Live classes for this course (visible to enrolled students + staff;
  // the API returns 403 for everyone else and we simply hide the block).
  const sessionUserId = session?.user?.id ?? null;
  useEffect(() => {
    if (!courseId || !sessionUserId) {
      setLiveClasses([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/live-classes?courseId=${courseId}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          if (!cancelled) setLiveClasses([]);
          return;
        }
        const result = await response.json();
        if (cancelled) return;
        // Keep upcoming + recently-finished sessions only.
        const cutoff = Date.now() - 60 * 60 * 1000;
        setLiveClasses(
          (result.data ?? []).filter(
            (item: LiveClassItem) =>
              new Date(item.endsAt).getTime() >= cutoff,
          ),
        );
      } catch {
        if (!cancelled) setLiveClasses([]);
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
      // the SUM of four round trips — fire them together and wait for the
      // slowest single one instead.
      const [response, lessonsResponse, progressResponse, certResponse] =
        await Promise.all([
          fetch(`/api/courses/${courseId}`),
          fetch(`/api/lessons?courseId=${encodeURIComponent(courseId)}`),
          fetch(`/api/progress?courseId=${encodeURIComponent(courseId)}`),
          fetch("/api/certificates"),
        ]);
      
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
        // Cache for instant first paint on the next visit (paint-first from
        // localStorage, then this background fetch patches what changed).
        primeResourceCache<CourseDetail>(
          "course-detail",
          `public:${courseId}`,
          data,
        );
        // Remember this course so the navbar "Courses" tab can return
        // here (lab → courses switch) instead of always showing the list.
        try {
          window.sessionStorage.setItem("propycoder-last-course", courseId);
        } catch {
          // Storage unavailable.
        }

        if (lessonsResponse.ok) {
          const lessonsData = await lessonsResponse.json();
          const loadedModules: Module[] = lessonsData.modules ?? [];
          setModules(loadedModules);
          setIsEnrolled(lessonsData.isEnrolled);
          primeResourceCache<Module[]>(
            "course-modules",
            `public:${courseId}`,
            loadedModules,
          );

          // Fetched in parallel above; only meaningful for enrolled users
          // (401 when signed out, empty otherwise).
          if (lessonsData.isEnrolled && progressResponse.ok) {
            const progressData = await progressResponse.json();
            setCompletedLessonIds(
              new Set(
                progressData.data
                  .filter(
                    (item: { status: string }) =>
                      item.status === "COMPLETED",
                  )
                  .map((item: { lessonId: string }) => item.lessonId),
              ),
            );
          }

          // If a certificate already exists for this course, surface it
          // (also fetched in parallel above).
          try {
            if (certResponse.ok) {
              const certData = await certResponse.json();
              const match = (certData.data ?? []).find(
                (entry: { course: string }) =>
                  entry.course === data.title,
              );
              if (match) setCertificateId(match.id);
            }
          } catch {
            // Storage/network unavailable — certificate link stays hidden.
          }

          // Restore the lesson the user was last watching (survives
          // lab → courses → back). Falls back to the first free preview,
          // then the first accessible lesson.
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
      
    } catch {
    } finally {
      setIsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (!courseId) return;
    // If the first paint was primed from cache, course/modules already read
    // from localStorage — run the network fetch without showing the blocker.
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

  // Persist and restore the actual scroll surface (window or an overflow container).
  useEffect(() => {
    if (!courseId) return;
    const storageKey = `propycoder-course-scroll:${courseId}`;
    const target = getCourseScrollTarget();
    let frame = 0;

    const persist = () => {
      frame = 0;
      if (isRestoringScroll.current) return;
      try {
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

    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", persist);
    return () => {
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", persist);
      if (frame) window.cancelAnimationFrame(frame);
      if (!isRestoringScroll.current) {
        const current = readCourseScrollPosition(target);
        if (current > 0) {
          try { window.sessionStorage.setItem(storageKey, String(current)); } catch { /* Storage unavailable. */ }
        }
      }
    };
  }, [courseId]);

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
    const target = getCourseScrollTarget();
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
      writeCourseScrollPosition(target, saved);
      const position = readCourseScrollPosition(target);
      const enoughContent = target === window
        ? document.documentElement.scrollHeight >= saved + window.innerHeight
        : target.scrollHeight >= saved + target.clientHeight;
      if (Math.abs(position - saved) <= 1 && enoughContent) {
        finish();
        return;
      }
      if (Date.now() - startedAt >= 8000) {
        writeCourseScrollPosition(target, saved);
        finish();
        return;
      }
      timeoutId = window.setTimeout(tick, 80);
    };

    const observer = typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => tick())
      : null;
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => tick())
      : null;
    observer?.observe(document.documentElement, { childList: true, subtree: true });
    resizeObserver?.observe(target === window ? document.documentElement : target);
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
          window.location.href = payload.checkoutUrl;
          return;
        }
        // No gateway configured (e.g. free course) — we are already enrolled.
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
  // beneath the tapped topic — not pinned above/below the whole list.
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
      // server-side — fetch it so the certificate card unlocks right away.
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
            );
            if (match) setCertificateId(match.id);
          }
        } catch {
          // Ignore — the card will appear on next load.
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

  if (!course) {
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

          {/* Pricing & enrollment — beside the cover/overview/instructor,
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

          {/* Curriculum (left) + video player (right) — full-width row */}
          <div className="course-learning-grid">
            <div className="course-curriculum">
              {/* Live classes — upcoming/running sessions for this course */}
              {liveClasses.length > 0 && (
                <div className="course-live">
                  <div className="course-live-head">
                    <Radio size={16} />
                    <h3>Live classes</h3>
                  </div>
                  <div className="course-live-list">
                    {liveClasses.map((item) => {
                      const status = effectiveStatus({
                        status: item.storedStatus,
                        startsAt: item.startsAt,
                        endsAt: item.endsAt,
                      });
                      const start = new Date(item.startsAt);
                      const end = new Date(item.endsAt);
                      const isStaff =
                        session?.user?.id === course?.instructor.id;
                      const canJoin =
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
                              {" – "}
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
                  {/* Certificate — locked until the course is 100% complete */}
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

            {/* Video Player — desktop only; mobile renders the same
                player inline directly beneath the tapped topic. */}
            {!isMobileViewport && lessonPlayer}
          </div>
        </div>
      </main>
    </div>
  );
}
