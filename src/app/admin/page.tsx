"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  Check,
  CircleDollarSign,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";

type AdminOverview = {
  metrics: {
    totalUsers: number;
    activeStudents: number;
    instructorCount: number;
    totalCourses: number;
    publishedCourses: number;
    draftCourses: number;
    enrollmentCount: number;
    monthlyEnrollments: number;
    completedEnrollments: number;
    completionRate: number;
    revenue: number;
    completedPayments: number;
  };
  recentUsers: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    createdAt: string;
    isActive: boolean;
  }[];
  recentCourses: {
    id: string;
    title: string;
    category: string;
    status: string;
    price: number;
    updatedAt: string;
    instructor: { firstName: string; lastName: string };
    _count: { enrollments: number };
  }[];
  recentEnrollments: {
    id: string;
    status: string;
    enrolledAt: string;
    student: { firstName: string; lastName: string; email: string };
    course: { id: string; title: string };
  }[];
};

type View = "overview" | "courses" | "students" | "enrollments";
const viewLabels: Record<View, string> = {
  overview: "Overview",
  courses: "Courses",
  students: "Students",
  enrollments: "Enrollments",
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [search, setSearch] = useState("");

  const loadOverview = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const response = await fetch("/api/admin/overview", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not load admin data");
      setOverview(await response.json());
    } catch {
      toast.error("Could not load the admin dashboard");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/login");
    if (session?.user && session.user.role !== "ADMIN")
      router.replace("/dashboard");
    if (session?.user?.role === "ADMIN") void loadOverview();
  }, [status, session, router, loadOverview]);

  const filteredItems = useMemo(() => {
    if (!overview) return [];
    const query = search.trim().toLowerCase();
    if (view === "courses")
      return overview.recentCourses.filter((course) =>
        `${course.title} ${course.category} ${course.instructor.firstName} ${course.instructor.lastName}`
          .toLowerCase()
          .includes(query),
      );
    if (view === "students")
      return overview.recentUsers.filter((user) =>
        `${user.firstName} ${user.lastName} ${user.email}`
          .toLowerCase()
          .includes(query),
      );
    if (view === "enrollments")
      return overview.recentEnrollments.filter((enrollment) =>
        `${enrollment.student.firstName} ${enrollment.student.lastName} ${enrollment.course.title}`
          .toLowerCase()
          .includes(query),
      );
    return [];
  }, [overview, search, view]);

  function exportCsv() {
    if (!overview) return;
    const rows =
      view === "students"
        ? [
            ["Name", "Email", "Status", "Joined"],
            ...(filteredItems as AdminOverview["recentUsers"]).map((user) => [
              `${user.firstName} ${user.lastName}`,
              user.email,
              user.isActive ? "Active" : "Inactive",
              new Date(user.createdAt).toLocaleDateString(),
            ]),
          ]
        : view === "enrollments"
          ? [
              ["Student", "Email", "Course", "Status", "Enrolled"],
              ...(filteredItems as AdminOverview["recentEnrollments"]).map(
                (entry) => [
                  `${entry.student.firstName} ${entry.student.lastName}`,
                  entry.student.email,
                  entry.course.title,
                  entry.status,
                  new Date(entry.enrolledAt).toLocaleDateString(),
                ],
              ),
            ]
          : [
              ["Course", "Category", "Instructor", "Status", "Students"],
              ...(filteredItems as AdminOverview["recentCourses"]).map(
                (course) => [
                  course.title,
                  course.category,
                  `${course.instructor.firstName} ${course.instructor.lastName}`,
                  course.status,
                  String(course._count.enrollments),
                ],
              ),
            ];
    const csv = rows
      .map((row) =>
        row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `propycoder-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function updateStudentStatus(userId: string, isActive: boolean) {
    if (
      !window.confirm(
        `${isActive ? "Deactivate" : "Reactivate"} this student account?`,
      )
    )
      return;
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!response.ok) throw new Error("Student update failed");
      toast.success(`Student ${isActive ? "deactivated" : "reactivated"}`);
      await loadOverview(true);
    } catch {
      toast.error("Could not update this student account");
    }
  }

  async function updateCourseStatus(courseId: string, status: string) {
    const nextStatus = status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    try {
      const response = await fetch(`/api/admin/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) throw new Error("Course update failed");
      toast.success(
        `Course ${nextStatus === "PUBLISHED" ? "published" : "unpublished"}`,
      );
      await loadOverview(true);
    } catch {
      toast.error("Could not update this course");
    }
  }

  if (
    status === "loading" ||
    !session?.user ||
    session.user.role !== "ADMIN" ||
    isLoading
  )
    return <LoadingView />;
  if (!overview)
    return (
      <div className="admin-app">
        <Navbar />
        <main className="admin-empty">
          <ShieldCheck />
          <h1>Dashboard unavailable</h1>
          <p>We could not retrieve your LMS data.</p>
          <button
            className="admin-button admin-button-primary"
            onClick={() => void loadOverview()}
          >
            Try again
          </button>
        </main>
      </div>
    );

  const { metrics } = overview;
  const cards = [
    {
      label: "Platform users",
      value: metrics.totalUsers.toLocaleString(),
      detail: `${metrics.activeStudents} active students`,
      icon: Users,
      tone: "orange",
    },
    {
      label: "Published courses",
      value: metrics.publishedCourses.toLocaleString(),
      detail: `${metrics.draftCourses} drafts in progress`,
      icon: BookOpen,
      tone: "blue",
    },
    {
      label: "Course enrollments",
      value: metrics.enrollmentCount.toLocaleString(),
      detail: `${metrics.monthlyEnrollments} joined this month`,
      icon: GraduationCap,
      tone: "cyan",
    },
    {
      label: "Course completion",
      value: `${metrics.completionRate}%`,
      detail: `${metrics.completedEnrollments} completed`,
      icon: Check,
      tone: "yellow",
    },
  ];

  return (
    <div className="admin-app">
      <Navbar />
      <main className="admin-shell">
        <aside className="admin-sidebar" aria-label="Admin navigation">
          <div className="admin-sidebar-label">WORKSPACE</div>
          {(Object.keys(viewLabels) as View[]).map((item) => {
            const Icon =
              item === "overview"
                ? LayoutDashboard
                : item === "courses"
                  ? BookOpen
                  : item === "students"
                    ? Users
                    : GraduationCap;
            return (
              <button
                key={item}
                className={`admin-nav-item ${view === item ? "is-active" : ""}`}
                onClick={() => {
                  setView(item);
                  setSearch("");
                }}
              >
                <Icon size={17} />
                <span>{viewLabels[item]}</span>
                {view === item && <span className="admin-nav-dot" />}
              </button>
            );
          })}
          <div className="admin-sidebar-foot">
            <div className="admin-status-dot" />
            <span>Admin access enabled</span>
          </div>
        </aside>

        <section className="admin-main">
          <header className="admin-heading">
            <div>
              <div className="admin-eyebrow">PROPYCODER / ADMINISTRATION</div>
              <h1>
                {viewLabels[view]}
                <span className="admin-heading-dot">.</span>
              </h1>
              <p>
                Good to see you, {session.user.name?.split(" ")[0] ?? "Admin"}.
                Here&apos;s what&apos;s happening across your learning platform.
              </p>
            </div>
            <div className="admin-heading-actions">
              <span className="admin-updated">
                <span className="admin-status-dot" /> Live data
              </span>
              <button
                className="admin-button"
                title="Refresh dashboard"
                onClick={() => void loadOverview(true)}
                disabled={isRefreshing}
              >
                <RefreshCw
                  size={16}
                  className={isRefreshing ? "admin-spin" : ""}
                />
                <span>Refresh</span>
              </button>
            </div>
          </header>

          {view === "overview" ? (
            <>
              <div className="admin-metrics">
                {cards.map(({ label, value, detail, icon: Icon, tone }) => (
                  <article className="admin-metric" key={label}>
                    <div className="admin-metric-top">
                      <span>{label}</span>
                      <span className={`admin-icon admin-icon-${tone}`}>
                        <Icon size={18} />
                      </span>
                    </div>
                    <div className="admin-metric-value">{value}</div>
                    <div className="admin-metric-detail">{detail}</div>
                  </article>
                ))}
              </div>
              <div className="admin-overview-grid">
                <section className="admin-panel admin-revenue">
                  <div className="admin-panel-heading">
                    <div>
                      <div className="admin-eyebrow">PAYMENTS</div>
                      <h2>Revenue overview</h2>
                    </div>
                    <CircleDollarSign size={19} />
                  </div>
                  <div className="admin-revenue-total">
                    $
                    {metrics.revenue.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                  <div className="admin-revenue-note">
                    From {metrics.completedPayments} completed payments
                  </div>
                  <div className="admin-revenue-foot">
                    <span>All-time recorded revenue</span>
                    <span>USD</span>
                  </div>
                </section>
                <section className="admin-panel admin-quick-actions">
                  <div className="admin-panel-heading">
                    <div>
                      <div className="admin-eyebrow">SHORTCUTS</div>
                      <h2>Quick access</h2>
                    </div>
                    <ArrowUpRight size={18} />
                  </div>
                  <Link href="/courses" className="admin-shortcut">
                    <span className="admin-shortcut-icon">
                      <BookOpen size={17} />
                    </span>
                    <span>
                      <strong>Browse course catalog</strong>
                      <small>Review the learner experience</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </Link>
                  <Link href="/dashboard" className="admin-shortcut">
                    <span className="admin-shortcut-icon">
                      <Users size={17} />
                    </span>
                    <span>
                      <strong>Student workspace</strong>
                      <small>Preview the learning dashboard</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </Link>
                  <div className="admin-draft-note">
                    <Clock3 size={15} />
                    <span>
                      {metrics.draftCourses} courses are still in draft
                    </span>
                  </div>
                </section>
              </div>
              <section className="admin-panel admin-recent-panel">
                <div className="admin-panel-heading">
                  <div>
                    <div className="admin-eyebrow">LATEST ACTIVITY</div>
                    <h2>Recent enrollments</h2>
                  </div>
                  <button
                    className="admin-text-button"
                    onClick={() => setView("enrollments")}
                  >
                    View all <ArrowUpRight size={15} />
                  </button>
                </div>
                <EnrollmentTable
                  items={overview.recentEnrollments.slice(0, 5)}
                />
              </section>
            </>
          ) : (
            <section className="admin-panel admin-management-panel">
              <div className="admin-management-heading">
                <div>
                  <div className="admin-eyebrow">MANAGEMENT</div>
                  <h2>{viewLabels[view]}</h2>
                  <p>
                    {view === "courses"
                      ? `${metrics.totalCourses} courses · ${metrics.publishedCourses} published`
                      : view === "students"
                        ? `${metrics.activeStudents} active students · ${metrics.instructorCount} instructors`
                        : `${metrics.enrollmentCount} total enrollments`}
                  </p>
                </div>
                <button
                  className="admin-button"
                  onClick={exportCsv}
                  title="Export visible records"
                >
                  <ArrowDownToLine size={16} />
                  <span>Export CSV</span>
                </button>
              </div>
              <label className="admin-search">
                <Search size={17} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={`Search ${view}...`}
                />
              </label>
              {view === "courses" ? (
                <CourseTable
                  items={filteredItems as AdminOverview["recentCourses"]}
                  onToggle={updateCourseStatus}
                />
              ) : view === "students" ? (
                <StudentTable
                  items={filteredItems as AdminOverview["recentUsers"]}
                  onToggle={updateStudentStatus}
                />
              ) : (
                <EnrollmentTable
                  items={filteredItems as AdminOverview["recentEnrollments"]}
                />
              )}
              {filteredItems.length === 0 && (
                <div className="admin-no-results">
                  No matching records in the latest activity.
                </div>
              )}
              <div className="admin-table-foot">
                Showing up to {view === "enrollments" ? 20 : 50} latest records.
                Dashboard data is read directly from your LMS database.
              </div>
            </section>
          )}
          <footer className="admin-footer">
            <span>ProPyCoder Learning Platform</span>
            <span>
              {metrics.totalUsers.toLocaleString()} users <i />{" "}
              {metrics.totalCourses.toLocaleString()} courses
            </span>
          </footer>
        </section>
      </main>
    </div>
  );
}

function LoadingView() {
  return (
    <div className="admin-app">
      <Navbar />
      <div className="admin-loading">
        <LoaderCircle size={27} className="admin-spin" />
        <span>Loading your workspace</span>
      </div>
    </div>
  );
}

function CourseTable({
  items,
  onToggle,
}: {
  items: AdminOverview["recentCourses"];
  onToggle: (id: string, status: string) => void;
}) {
  return (
    <div className="admin-table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Course</th>
            <th>Instructor</th>
            <th>Students</th>
            <th>Price</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((course) => (
            <tr key={course.id}>
              <td>
                <strong>{course.title}</strong>
                <small>{course.category}</small>
              </td>
              <td>
                {course.instructor.firstName} {course.instructor.lastName}
              </td>
              <td>{course._count.enrollments}</td>
              <td>{course.price ? `$${course.price.toFixed(2)}` : "Free"}</td>
              <td>
                <span
                  className={`admin-pill ${course.status === "PUBLISHED" ? "is-good" : "is-muted"}`}
                >
                  {course.status.toLowerCase()}
                </span>
              </td>
              <td>
                <button
                  className="admin-row-action"
                  onClick={() => onToggle(course.id, course.status)}
                >
                  {course.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StudentTable({
  items,
  onToggle,
}: {
  items: AdminOverview["recentUsers"];
  onToggle: (id: string, isActive: boolean) => void;
}) {
  return (
    <div className="admin-table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Email</th>
            <th>Joined</th>
            <th>Account</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((user) => (
            <tr key={user.id}>
              <td>
                <span className="admin-avatar">
                  {user.firstName[0]}
                  {user.lastName[0]}
                </span>
                <strong>
                  {user.firstName} {user.lastName}
                </strong>
              </td>
              <td>{user.email}</td>
              <td>{new Date(user.createdAt).toLocaleDateString()}</td>
              <td>
                <span
                  className={`admin-pill ${user.isActive ? "is-good" : "is-muted"}`}
                >
                  {user.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              <td>
                <button
                  className="admin-row-action"
                  onClick={() => onToggle(user.id, user.isActive)}
                >
                  {user.isActive ? "Deactivate" : "Reactivate"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EnrollmentTable({
  items,
}: {
  items: AdminOverview["recentEnrollments"];
}) {
  return (
    <div className="admin-table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Course</th>
            <th>Enrolled</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((enrollment) => (
            <tr key={enrollment.id}>
              <td>
                <strong>
                  {enrollment.student.firstName} {enrollment.student.lastName}
                </strong>
                <small>{enrollment.student.email}</small>
              </td>
              <td>
                <Link
                  href={`/courses/${enrollment.course.id}`}
                  className="admin-course-link"
                >
                  {enrollment.course.title}
                </Link>
              </td>
              <td>{new Date(enrollment.enrolledAt).toLocaleDateString()}</td>
              <td>
                <span
                  className={`admin-pill ${enrollment.status === "COMPLETED" ? "is-good" : "is-warm"}`}
                >
                  {enrollment.status.toLowerCase()}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
