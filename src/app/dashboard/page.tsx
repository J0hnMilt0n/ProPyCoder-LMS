"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import {
  ArrowRight,
  Award,
  BookOpen,
  Clock3,
  GraduationCap,
  LoaderCircle,
  Radio,
  Search,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  PROVIDER_LABELS,
  STATUS_LABELS,
  effectiveStatus,
} from "@/lib/live-classes";

interface Enrollment {
  id: string;
  course: {
    id: string;
    title: string;
    description: string;
    image: string | null;
    duration: number;
    instructor: { firstName: string; lastName: string };
  };
  progress: number;
  status: string;
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
  course?: { id: string; title: string };
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [liveClasses, setLiveClasses] = useState<LiveClassItem[]>([]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/login");
    if (session?.user?.role === "ADMIN") router.replace("/admin");
    else if (session?.user?.role === "INSTRUCTOR")
      router.replace("/instructor");
  }, [status, session, router]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const controller = new AbortController();
    const fetchEnrollments = async () => {
      setIsLoading(true);
      setLoadError(false);
      try {
        const response = await fetch("/api/enrollments", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Enrollment request failed");
        const result = await response.json();
        setEnrollments(result.data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setLoadError(true);
        toast.error("Could not load your courses");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    void fetchEnrollments();
    return () => controller.abort();
  }, [session?.user?.id]);

  // Live classes across my enrolled courses.
  useEffect(() => {
    if (!session?.user?.id) return;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/live-classes?scope=mine", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result = await response.json();
        if (!controller.signal.aborted) setLiveClasses(result.data ?? []);
      } catch {
        // Non-critical — the dashboard still works without the schedule.
      }
    })();
    return () => controller.abort();
  }, [session?.user?.id]);

  if (status === "loading" || isLoading) {
    return (
      <div className="learning-page">
        <Navbar />
        <div className="learning-loading">
          <LoaderCircle size={26} className="admin-spin" />
          <span>Opening your learning space</span>
        </div>
      </div>
    );
  }
  if (!session?.user) return null;

  const activeCourses = enrollments.filter((item) => item.status === "ACTIVE");
  const completedCourses = enrollments.filter(
    (item) => item.status === "COMPLETED",
  );
  const visibleCourses = enrollments.filter((item) =>
    `${item.course.title} ${item.course.instructor.firstName} ${item.course.instructor.lastName}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const nextCourse = activeCourses[0] ?? enrollments[0];

  return (
    <main className="learning-page">
      <Navbar />
      <section className="learning-shell">
        <header className="learning-welcome">
          <div>
            {session.user.image ? (
              <span className="learning-welcome-avatar">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={session.user.image}
                  alt=""
                  width={48}
                  height={48}
                />
              </span>
            ) : null}
            <div className="learning-eyebrow">YOUR LEARNING SPACE</div>
            <h1>
              Welcome back,{" "}
              <em>{session.user.name?.split(" ")[0] ?? "Learner"}.</em>
            </h1>
            <p>Small steps add up. Pick up where you left off.</p>
          </div>
          <Link href="/courses" className="learning-browse-button">
            Explore courses <ArrowRight size={16} />
          </Link>
          <span className="learning-welcome-art" aria-hidden="true">
            <GraduationCap />
          </span>
        </header>

        <div className="learning-stats">
          <article>
            <span className="learning-stat-icon stat-orange">
              <BookOpen size={18} />
            </span>
            <div>
              <strong>{enrollments.length}</strong>
              <span>Enrolled courses</span>
            </div>
          </article>
          <article>
            <span className="learning-stat-icon stat-amber">
              <Clock3 size={18} />
            </span>
            <div>
              <strong>{activeCourses.length}</strong>
              <span>In progress</span>
            </div>
          </article>
          <article>
            <span className="learning-stat-icon stat-blue">
              <Award size={18} />
            </span>
            <div>
              <strong>{completedCourses.length}</strong>
              <span>Completed</span>
            </div>
          </article>
        </div>

        {liveClasses.length > 0 && (
          <section className="learning-live">
            <div className="learning-section-label">
              UPCOMING LIVE CLASSES
            </div>
            <div className="learning-live-list">
              {liveClasses.map((item) => {
                const status = effectiveStatus({
                  status: item.storedStatus,
                  startsAt: item.startsAt,
                  endsAt: item.endsAt,
                });
                const start = new Date(item.startsAt);
                const end = new Date(item.endsAt);
                return (
                  <article
                    key={item.id}
                    className={`learning-live-row is-${status.toLowerCase()}`}
                  >
                    <div className="live-row-date">
                      <span>
                        {start.toLocaleDateString(undefined, {
                          month: "short",
                        })}
                      </span>
                      <strong>{start.getDate()}</strong>
                    </div>
                    <div className="learning-live-copy">
                      <strong>{item.title}</strong>
                      <span>
                        {item.course?.title ?? "Course"} ·{" "}
                        {start.toLocaleDateString(undefined, {
                          weekday: "short",
                        })}{" "}
                        {start.toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" – "}
                        {end.toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" · "}
                        {PROVIDER_LABELS[item.provider] ?? item.provider}
                      </span>
                    </div>
                    <span className={`live-pill is-${status.toLowerCase()}`}>
                      {status === "LIVE" && <span className="live-pill-dot" />}
                      {STATUS_LABELS[status]}
                    </span>
                    {(status === "SCHEDULED" || status === "LIVE") && (
                      <a
                        className="learning-live-join"
                        href={item.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Radio size={15} /> Join
                      </a>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {nextCourse && (
          <section className="learning-continue">
            <div className="learning-section-label">
              PICK UP WHERE YOU LEFT OFF
            </div>
            <div className="learning-continue-row">
              <div
                className="learning-continue-art"
                style={
                  nextCourse.course.image
                    ? {
                        backgroundImage: `linear-gradient(0deg, rgba(24, 24, 27, .35), rgba(24, 24, 27, .04)), url("${nextCourse.course.image}")`,
                      }
                    : undefined
                }
              >
                {
                  !nextCourse.course.image
                    ?(
                <BookOpen size={34} />):<></> }
              </div>
              <div className="learning-continue-copy">
                <span className="learning-course-kicker">
                  {nextCourse.status === "COMPLETED"
                    ? "COMPLETED COURSE"
                    : "YOUR CURRENT COURSE"}
                </span>
                <h2>{nextCourse.course.title}</h2>
                <p>
                  With {nextCourse.course.instructor.firstName}{" "}
                  {nextCourse.course.instructor.lastName}
                </p>
                <div className="learning-progress-label">
                  <span>Course progress</span>
                  <strong>{Math.round(nextCourse.progress)}%</strong>
                </div>
                <div className="learning-progress-track">
                  <span
                    style={{
                      width: `${Math.min(100, Math.max(0, nextCourse.progress))}%`,
                    }}
                  />
                </div>
              </div>
              <Link
                className="learning-continue-button"
                href={`/courses/${nextCourse.course.id}`}
                aria-label={`Continue ${nextCourse.course.title}`}
              >
                <ArrowRight size={19} />
              </Link>
            </div>
          </section>
        )}

        <section className="learning-courses">
          <div className="learning-list-heading">
            <div>
              <div className="learning-section-label">YOUR LIBRARY</div>
              <h2>
                My courses <span>{enrollments.length}</span>
              </h2>
            </div>
            <label className="learning-search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search my courses"
                aria-label="Search my courses"
              />
            </label>
          </div>
          {loadError ? (
            <div className="learning-empty">
              <BookOpen />
              <h3>We couldn&apos;t reach your courses.</h3>
              <button onClick={() => window.location.reload()}>
                Try again
              </button>
            </div>
          ) : visibleCourses.length === 0 ? (
            <div className="learning-empty">
              <BookOpen />
              <h3>
                {search
                  ? "No courses match that search."
                  : "Your learning journey starts here."}
              </h3>
              <p>
                {search
                  ? "Try a different course or instructor name."
                  : "Find a focused course and learn by making something real."}
              </p>
              <Link href="/courses">
                Explore the course library <ArrowRight size={15} />
              </Link>
            </div>
          ) : (
            <div className="learning-course-list">
              {visibleCourses.map((enrollment) => (
                <Link
                  href={`/courses/${enrollment.course.id}`}
                  className="learning-course-item"
                  key={enrollment.id}
                >
                  <div
                    className="learning-course-art"
                    style={
                      enrollment.course.image
                        ? {
                            backgroundImage: `linear-gradient(0deg, rgba(24, 24, 27, .25), rgba(24, 24, 27, .04)), url("${enrollment.course.image}")`,
                          }
                        : undefined
                    }
                  >
                    {
                      !enrollment.course.image
                        ?
                    (<BookOpen size={22} />):<></>}
                  </div>
                  <div className="learning-course-details">
                    <span className="learning-course-kicker">
                      {enrollment.status === "COMPLETED"
                        ? "COMPLETED"
                        : "IN PROGRESS"}
                    </span>
                    <h3>{enrollment.course.title}</h3>
                    <p>
                      {enrollment.course.instructor.firstName}{" "}
                      {enrollment.course.instructor.lastName} <i />{" "}
                      {enrollment.course.duration} hours
                    </p>
                    <div className="learning-progress-track">
                      <span
                        style={{
                          width: `${Math.min(100, Math.max(0, enrollment.progress))}%`,
                        }}
                      />
                    </div>
                  </div>
                  <strong className="learning-item-progress">
                    {Math.round(enrollment.progress)}%
                  </strong>
                  <ArrowRight className="learning-item-arrow" size={17} />
                </Link>
              ))}
            </div>
          )}
        </section>
      </section>
      <footer className="learning-footer">
        <span>PROPYCODER LEARNING</span>
        <Link href="/pycoder">
          Open the PyCoder lab <ArrowRight size={14} />
        </Link>
      </footer>
    </main>
  );
}
