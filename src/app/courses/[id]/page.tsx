"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import {
  Clock,
  Users,
  Award,
  BookOpen,
  CheckCircle,
  PlayCircle,
  Lock,
  CreditCard,
  Video,
} from "lucide-react";
import toast from "react-hot-toast";
import { LessonVideoPlayer } from "@/components/lesson-video-player";

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
  image: string | null;
  duration: number;
  instructor: {
    id: string;
    firstName: string;
    lastName: string;
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

export default function CourseDetailPage({ params }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [courseId, setCourseId] = useState<string>("");
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(
    new Set(),
  );
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);
  const totalLessons = modules.reduce(
    (total, module) => total + module.lessons.length,
    0,
  );
  const completedLessons = completedLessonIds.size;

  useEffect(() => {
    // Get the course ID from params
    params.then((p) => {
      setCourseId(p.id);
    });
  }, [params]);

  useEffect(() => {
    if (!courseId) return;

    const fetchCourse = async () => {
      try {
        const response = await fetch(`/api/courses/${courseId}`);
        if (response.ok) {
          const data = await response.json();
          setCourse(data);
          // Remember this course so the navbar "Courses" tab can return
          // here (lab → courses switch) instead of always showing the list.
          try {
            window.sessionStorage.setItem("propycoder-last-course", courseId);
          } catch {
            // Storage unavailable.
          }

          // Fetch lessons for this course
          const lessonsResponse = await fetch(
            `/api/lessons?courseId=${courseId}`,
          );
          if (lessonsResponse.ok) {
            const lessonsData = await lessonsResponse.json();
            setModules(lessonsData.modules);
            setIsEnrolled(lessonsData.isEnrolled);

            if (lessonsData.isEnrolled) {
              const progressResponse = await fetch(
                `/api/progress?courseId=${courseId}`,
              );
              if (progressResponse.ok) {
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
            }

            // Find first free preview lesson
            const firstFreeLesson = lessonsData.modules
              .flatMap((m: Module) => m.lessons)
              .find((l: Lesson) => l.isFree && l.videoId);
            if (firstFreeLesson) {
              setSelectedLesson(firstFreeLesson);
            }
          }
        } else {
          toast.error("Course not found");
          router.push("/courses");
        }
      } catch {
        toast.error("Failed to load course");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCourse();
  }, [courseId, router]);

  // Persist the scroll position per course so refresh and back-navigation
  // (e.g. lab → courses → back) restore where the user was.
  useEffect(() => {
    if (!courseId) return;
    const storageKey = `propycoder-course-scroll:${courseId}`;
    let frame = 0;
    const persist = () => {
      frame = 0;
      try {
        window.sessionStorage.setItem(storageKey, String(window.scrollY));
      } catch {
        // Storage unavailable.
      }
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(persist);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // NOTE: do NOT persist() here — on first mount (and after returning
    // from another route) scrollY is already 0, which would clobber the
    // saved position before the restore effect can read it.
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      // Persist on unmount, but never a 0: Next may reset scroll to top
      // before this cleanup runs, which would clobber the real position.
      // Real positions were already written by the scroll handler.
      if (window.scrollY > 0) persist();
    };
  }, [courseId]);

  // Restore the saved scroll position once content has rendered.
  useEffect(() => {
    if (isLoading || !courseId) return;
    try {
      const raw = window.sessionStorage.getItem(
        `propycoder-course-scroll:${courseId}`,
      );
      const saved = raw === null ? 0 : Number(raw);
      if (Number.isFinite(saved) && saved > 0) {
        const restore = () => window.scrollTo(0, saved);
        // Double rAF: let layout settle after data paints first.
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(restore),
        );
      }
    } catch {
      // Storage unavailable.
    }
  }, [isLoading, courseId]);

  const handleEnroll = async () => {
    if (!session?.user) {
      router.push("/auth/login");
      return;
    }

    // If course is free, enroll directly
    if (course?.price === 0) {
      setIsEnrolling(true);
      try {
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
      } catch {
        toast.error("An error occurred");
      } finally {
        setIsEnrolling(false);
      }
    } else {
      toast.error("Secure checkout is not configured for this course yet.");
    }
  };

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
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save progress",
      );
    } finally {
      setIsMarkingComplete(false);
    }
  };

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
        <div className="max-w-4xl mx-auto py-12">
          <p className="text-center text-gray-600">Course not found</p>
        </div>
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
            onClick={() => router.back()}
            aria-label="Go back"
          >
            ← Back
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
                      backgroundImage: `linear-gradient(90deg, rgba(24, 24, 27, .72), rgba(24, 24, 27, .08)), url("${course.image}")`,
                    }
                  : undefined
              }
            >
              <span>{course.category}</span>
              <BookOpen size={44} />
              <strong>LEARN BY BUILDING</strong>
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

              {/* Instructor */}
              <div className="mt-6">
                <h2 className="text-lg font-bold text-gray-900 mb-3">
                  Instructor
                </h2>
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 w-10 h-10 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-bold">
                      {course.instructor.firstName[0]}
                    </span>
                  </div>
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

          {/* Pricing & enrollment — beside the cover/overview/instructor,
              non-sticky so it scrolls away with the page */}
          <div className="course-detail-sidebar">
            <div className="course-purchase-card">
                <div className="mb-6">
                  {course.price > 0 ? (
                    <div className="text-3xl font-bold text-gray-900 mb-2">
                      ${course.price}
                    </div>
                  ) : (
                    <div className="text-2xl font-bold text-sky-600 mb-2">
                      Free
                    </div>
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
                      Checkout unavailable
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
                    Secure checkout has not been configured yet.
                  </p>
                )}

                <div className="mt-6 space-y-3">
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
            </div>
          </div>

          {/* Curriculum (left) + video player (right) — full-width row */}
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
                          <button
                            type="button"
                            key={lesson.id}
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
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">
                  Course curriculum will be available soon.
                </p>
              )}
            </div>

            {/* Video Player */}
            {selectedLesson && (isEnrolled || selectedLesson.isFree) && (
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
                  <p className="mt-4 text-gray-600">
                    {selectedLesson.description}
                  </p>
                )}
                {isEnrolled && (
                  <button
                    type="button"
                    className="course-complete-button"
                    disabled={
                      isMarkingComplete ||
                      completedLessonIds.has(selectedLesson.id)
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
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
