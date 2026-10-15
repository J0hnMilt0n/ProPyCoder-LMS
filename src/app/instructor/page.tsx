"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import {
  ArrowRight,
  BookOpen,
  Clock3,
  GraduationCap,
  LoaderCircle,
  Plus,
  Users,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { CourseContentManager } from "@/components/course-content-manager";
import { LiveClassManager } from "@/components/live-class-manager";
import { ImageUploadField } from "@/components/image-upload-field";
import { useResource } from "@/lib/use-resource";

interface InstructorCourse {
  id: string;
  title: string;
  category: string;
  status: string;
  price: number;
  offerPrice: number | null;
  duration: number;
  updatedAt: string;
  _count: { enrollments: number; modules: number };
}

const emptyForm = {
  title: "",
  description: "",
  category: "Python",
  level: "BEGINNER",
  price: "0",
  offerPrice: "",
  duration: "1",
  image: "",
};

export default function InstructorPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [contentCourse, setContentCourse] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const userId = session?.user?.id ?? "";
  const role = session?.user?.role;

  // Stale-while-revalidate: paint the cached course list instantly, refresh in
  // the background, and patch only when something actually changed.
  const coursesRes = useResource<InstructorCourse[]>({
    key: "instructor-courses",
    url: "/api/instructor/courses",
    scope: userId,
    enabled: role === "INSTRUCTOR",
    select: (json) => (json as { data: InstructorCourse[] }).data,
  });
  const courses = coursesRes.data ?? [];
  const isLoading = coursesRes.isLoading;

  const role$ = role;
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/login");
    if (role$ && role$ !== "INSTRUCTOR") router.replace("/dashboard");
  }, [status, role$, router]);

  async function createCourse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch("/api/instructor/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          price: Number(form.price),
          offerPrice:
            form.offerPrice.trim() === "" || Number(form.offerPrice) <= 0
              ? null
              : Number(form.offerPrice),
          duration: Number(form.duration),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Course creation failed");
      toast.success("Draft course created");
      setForm(emptyForm);
      // Pull the fresh list so the new draft appears without a full reload.
      coursesRes.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create course",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (status === "loading" || isLoading) {
    return (
      <div className="instructor-page">
        <Navbar />
        <div className="learning-loading">
          <LoaderCircle size={26} className="admin-spin" />
          <span>Opening your instructor workspace</span>
        </div>
      </div>
    );
  }
  if (!session?.user || session.user.role !== "INSTRUCTOR") return null;

  const studentCount = courses.reduce(
    (total, course) => total + course._count.enrollments,
    0,
  );
  const publishedCount = courses.filter(
    (course) => course.status === "PUBLISHED",
  ).length;
  const draftCount = courses.filter(
    (course) => course.status === "DRAFT",
  ).length;

  return (
    <main className="instructor-page">
      <Navbar />
      <div className="instructor-shell">
        <header className="instructor-heading">
          <div>
            <div className="instructor-eyebrow">
              PROPYCODER / INSTRUCTOR SPACE
            </div>
            <h1>
              Teach what you <em>know.</em>
            </h1>
            <p>
              Build and review the courses you bring to the learning community.
            </p>
          </div>
          <span className="instructor-account">
            {session.user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="instructor-account-avatar"
                src={session.user.image}
                alt=""
                width={34}
                height={34}
              />
            ) : (
              <span>
                {session.user.name
                  ?.split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)}
              </span>
            )}
            {session.user.name}
          </span>
        </header>
        <div className="instructor-stats">
          <article>
            <BookOpen />
            <strong>{courses.length}</strong>
            <span>Total courses</span>
          </article>
          <article>
            <Users />
            <strong>{studentCount}</strong>
            <span>Course enrollments</span>
          </article>
          <article>
            <GraduationCap />
            <strong>{publishedCount}</strong>
            <span>Published</span>
          </article>
          <article>
            <Clock3 />
            <strong>{draftCount}</strong>
            <span>Drafts</span>
          </article>
        </div>
        <div className="instructor-grid">
          <section className="instructor-course-area">
            <div className="instructor-section-heading">
              <div>
                <span>YOUR CONTENT</span>
                <h2>My courses</h2>
              </div>
              <span>{courses.length} total</span>
            </div>
            {courses.length === 0 ? (
              <div className="instructor-empty">
                <BookOpen />
                <h3>Your first course starts here.</h3>
                <p>
                  Create a draft, add your lessons, then submit it for review.
                </p>
              </div>
            ) : (
              <div className="instructor-course-list">
                {courses.map((course) => (
                  <article className="instructor-course-row" key={course.id}>
                    <div className="instructor-course-icon">
                      <BookOpen size={20} />
                    </div>
                    <div className="instructor-course-copy">
                      <h3>{course.title}</h3>
                      <p>
                        {course.category} <i /> {course.duration} hours <i />{" "}
                        {course._count.modules} modules
                      </p>
                    </div>
                    <div className="instructor-course-enrollments">
                      <strong>{course._count.enrollments}</strong>
                      <span>learner{course._count.enrollments>1?"s":""}</span>
                    </div>
                    <span
                      className={`instructor-status ${course.status === "PUBLISHED" ? "is-live" : "is-draft"}`}
                    >
                      {course.status.toLowerCase()}
                    </span>
                    <button
                      type="button"
                      className="instructor-content-button"
                      onClick={() =>
                        setContentCourse({ id: course.id, title: course.title })
                      }
                    >
                      <BookOpen size={15} />
                      Manage content
                    </button>
                    <Link
                      href={`/courses/${course.id}`}
                      aria-label={`Open ${course.title}`}
                    >
                      <ArrowRight size={16} />
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="instructor-create">
            <div className="instructor-section-heading">
              <div>
                <span>CONTENT STUDIO</span>
                <h2>
                  <Plus size={16} /> New course
                </h2>
              </div>
            </div>
            <form onSubmit={createCourse} className="instructor-form">
              <label>
                Course title
                <input
                  value={form.title}
                  minLength={4}
                  maxLength={120}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  required
                  placeholder="e.g. Python for automation"
                />
              </label>
              <label>
                Description
                <textarea
                  value={form.description}
                  minLength={20}
                  maxLength={5000}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  required
                  rows={4}
                  placeholder="What will learners be able to make?"
                />
              </label>
              <div className="instructor-form-row">
                <label>
                  Category
                  <select
                    value={form.category}
                    onChange={(event) =>
                      setForm({ ...form, category: event.target.value })
                    }
                  >
                    {[
                      "Python",
                      "Web Development",
                      "Mobile Development",
                      "Data Science",
                      "DevOps",
                      "Cloud Computing",
                    ].map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Level
                  <select
                    value={form.level}
                    onChange={(event) =>
                      setForm({ ...form, level: event.target.value })
                    }
                  >
                    <option value="BEGINNER">Beginner</option>
                    <option value="INTERMEDIATE">Intermediate</option>
                    <option value="ADVANCED">Advanced</option>
                  </select>
                </label>
              </div>
              <div className="instructor-form-row">
                <label>
                  Price (₹)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(event) =>
                      setForm({ ...form, price: event.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Offer price (₹) — optional
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Leave empty for no offer"
                    value={form.offerPrice}
                    onChange={(event) =>
                      setForm({ ...form, offerPrice: event.target.value })
                    }
                  />
                </label>
              </div>
              <div className="instructor-form-row">
                <label>
                  Duration (hours)
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    value={form.duration}
                    onChange={(event) =>
                      setForm({ ...form, duration: event.target.value })
                    }
                    required
                  />
                </label>
              </div>
              <ImageUploadField
                value={form.image}
                onChange={(image) => setForm({ ...form, image })}
              />
              <button className="instructor-submit" disabled={isSaving}>
                {isSaving ? (
                  <LoaderCircle size={15} className="admin-spin" />
                ) : (
                  <Plus size={16} />
                )}
                {isSaving ? "Creating draft..." : "Create draft course"}
              </button>
            </form>
            <p className="instructor-form-note">
              New courses are saved as drafts. An administrator can publish them
              when they&apos;re ready.
            </p>
          </section>
        </div>
        <section className="instructor-live">
          <LiveClassManager
            mode="instructor"
            courses={courses.map((course) => ({
              id: course.id,
              title: course.title,
            }))}
          />
        </section>
      </div>
      {contentCourse && (
        <div
          className="admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setContentCourse(null);
          }}
        >
          <div
            className="admin-modal admin-modal-wide"
            role="dialog"
            aria-modal="true"
            aria-label={`Course content: ${contentCourse.title}`}
          >
            <div className="admin-modal-head">
              <div>
                <div className="admin-eyebrow">COURSE CONTENT</div>
                <h2>{contentCourse.title}</h2>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                aria-label="Close"
                onClick={() => setContentCourse(null)}
              >
                <X size={15} />
              </button>
            </div>
            <div className="admin-modal-scroll">
              <CourseContentManager
                courseId={contentCourse.id}
                onChanged={coursesRes.refresh}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
