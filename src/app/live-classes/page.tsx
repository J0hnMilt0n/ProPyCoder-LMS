"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, Radio, Video } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { PROVIDER_LABELS } from "@/lib/live-classes";
import { useResource } from "@/lib/use-resource";

interface PublicLiveClass {
  id: string;
  title: string;
  description: string | null;
  provider: string;
  startsAt: string;
  endsAt: string;
  status: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
  courseId: string;
  course: { id: string; title: string };
  instructor: { firstName: string; lastName: string };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function LiveClassesPage() {
  const liveClassesRes = useResource<PublicLiveClass[]>({
    key: "live-classes-public",
    url: "/api/live-classes?scope=public",
    scope: "public",
    select: (json) => (json as { data?: PublicLiveClass[] }).data ?? [],
  });
  const classes = liveClassesRes.data ?? [];
  const loading = liveClassesRes.isLoading;
  const error = liveClassesRes.error;

  return (
    <main className="catalog-page">
      <Navbar />
      <header className="catalog-hero">
        <div className="catalog-hero-inner">
          <div className="catalog-eyebrow">
            <Radio size={14} /> LEARN LIVE
          </div>
          <div className="catalog-hero-row">
            <div>
              <h1>
                Upcoming <em>live classes.</em>
              </h1>
              <p>
                Explore instructor-led sessions and join the course to attend.
              </p>
            </div>
            <div className="catalog-hero-note">
              <span>LEARN TOGETHER</span>
              <strong>Live sessions, expert instructors.</strong>
            </div>
          </div>
        </div>
      </header>
      <section className="catalog-section" aria-live="polite">
        {loading ? (
          <div className="catalog-empty"><Radio /><h2>Loading live classes…</h2></div>
        ) : error ? (
          <div className="catalog-empty">
            <Radio /><h2>Live classes couldn’t be loaded.</h2>
            <p>Please try again in a moment.</p>
          </div>
        ) : classes.length === 0 ? (
          <div className="catalog-empty">
            <CalendarDays /><h2>No upcoming live classes just yet.</h2>
            <p>Check back soon, or explore our courses in the meantime.</p>
            {/* <Link href="/courses" className="flex items-center mt-1 gap-3">Browse courses <ArrowRight size={15} /></Link> */}
          </div>
        ) : (
          <div className="bundle-store live-class-grid pl-5 pt-2">
            {classes.map((liveClass) => (
              <article key={liveClass.id} className="bundle-store-card">
                <div className="bundle-store-cover live-class-cover">
                  <>
                  <Video size={42} strokeWidth={1.4} />
                  <span className="live-class-provider live-class-cover-provider">
                    {PROVIDER_LABELS[liveClass.provider] ?? "Online"}
                  </span></>
                  <span className={`live-class-badge ${liveClass.status === "LIVE" ? "is-live" : ""}`}>
                    {liveClass.status === "LIVE" && <span className="live-class-dot" />}
                    {liveClass.status === "LIVE" ? "Live now" : "Upcoming"}
                  </span>
                  
                </div>
                <div className="bundle-store-body">
                  <span className="live-class-course">{liveClass.course.title}</span>
                  <h3>{liveClass.title}</h3>
                  {liveClass.description && <p>{liveClass.description}</p>}
                  <div className="live-class-meta">
                    <span><CalendarDays size={15} />{formatDate(liveClass.startsAt)}</span>
                    <span><Clock3 size={15} />Ends {formatDate(liveClass.endsAt)}</span>
                  </div>
                  <p className="live-class-instructor">
                    With {liveClass.instructor.firstName} {liveClass.instructor.lastName}
                  </p>
                  <div className="bundle-store-foot">
                    <Link href={`/courses/${liveClass.courseId}`} className="bundle-buy">
                      View course <ArrowRight size={15} />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
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