"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserCog,
  Users,
  Video,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { CourseContentManager } from "@/components/course-content-manager";
import { LiveClassManager } from "@/components/live-class-manager";
import { ImageUploadField } from "@/components/image-upload-field";
import { useConfirm } from "@/components/confirm-dialog";

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
    avatar: string | null;
    createdAt: string;
    isActive: boolean;
    role: string;
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
  instructors: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar: string | null;
    createdAt: string;
    isActive: boolean;
    role: string;
    _count: { createdCourses: number };
  }[];
  recentAnnouncements: {
    id: string;
    title: string;
    message: string;
    link: string | null;
    createdAt: string;
    recipients: number;
  }[];
};

type View =
  | "overview"
  | "courses"
  | "students"
  | "instructors"
  | "enrollments"
  | "live"
  | "announcements";
const viewLabels: Record<View, string> = {
  overview: "Overview",
  courses: "Courses",
  students: "Students",
  instructors: "Instructors",
  enrollments: "Enrollments",
  live: "Live classes",
  announcements: "Announcements",
};
const viewIcons: Record<View, typeof Users> = {
  overview: LayoutDashboard,
  courses: BookOpen,
  students: Users,
  instructors: UserCog,
  enrollments: GraduationCap,
  live: Video,
  announcements: Megaphone,
};

type CourseForm = {
  title: string;
  description: string;
  category: string;
  level: string;
  price: string;
  duration: string;
  image: string;
  status: string;
  instructorId: string;
};

const EMPTY_COURSE_FORM: CourseForm = {
  title: "",
  description: "",
  category: "Python",
  level: "BEGINNER",
  price: "0",
  duration: "1",
  image: "",
  status: "DRAFT",
  instructorId: "",
};

const COURSE_CATEGORIES = [
  "Python",
  "Web Development",
  "Mobile Development",
  "Data Science",
  "DevOps",
  "Cloud Computing",
];

type CourseModalState =
  | { mode: "create" }
  | { mode: "edit"; courseId: string }
  | null;

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [search, setSearch] = useState("");
  const [courseModal, setCourseModal] = useState<CourseModalState>(null);
  const [courseForm, setCourseForm] = useState<CourseForm>(EMPTY_COURSE_FORM);
  const [isSavingCourse, setIsSavingCourse] = useState(false);
  const [isLoadingCourse, setIsLoadingCourse] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announceForm, setAnnounceForm] = useState({
    title: "",
    message: "",
    link: "",
    audience: "ALL",
  });
  const [isSendingAnnouncement, setIsSendingAnnouncement] = useState(false);
  const [contentCourse, setContentCourse] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const confirm = useConfirm();
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
    if (view === "instructors")
      return overview.instructors.filter(
        (instructor) =>
          instructor.role === "INSTRUCTOR" &&
          `${instructor.firstName} ${instructor.lastName} ${instructor.email}`
            .toLowerCase()
            .includes(query),
      );
    if (view === "enrollments")
      return overview.recentEnrollments.filter((enrollment) =>
        `${enrollment.student.firstName} ${enrollment.student.lastName} ${enrollment.course.title}`
          .toLowerCase()
          .includes(query),
      );
    if (view === "announcements")
      return overview.recentAnnouncements.filter((announcement) =>
        `${announcement.title} ${announcement.message}`
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
        : view === "instructors"
          ? [
              ["Name", "Email", "Courses", "Status", "Joined"],
              ...(filteredItems as AdminOverview["instructors"]).map(
                (instructor) => [
                  `${instructor.firstName} ${instructor.lastName}`,
                  instructor.email,
                  String(instructor._count.createdCourses),
                  instructor.isActive ? "Active" : "Inactive",
                  new Date(instructor.createdAt).toLocaleDateString(),
                ],
              ),
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
          : view === "announcements"
            ? [
                ["Title", "Message", "Recipients", "Sent"],
                ...(filteredItems as AdminOverview["recentAnnouncements"]).map(
                  (announcement) => [
                    announcement.title,
                    announcement.message.replaceAll("\n", " "),
                    String(announcement.recipients),
                    new Date(announcement.createdAt).toLocaleDateString(),
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
      !await confirm({
        title: "Confirm action",
        message: `${isActive ? "Deactivate" : "Reactivate"} this student account?`,
      })
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

  function openCreateCourse() {
    setCourseForm({
      ...EMPTY_COURSE_FORM,
      instructorId: session?.user?.id ?? overview?.instructors[0]?.id ?? "",
    });
    setCourseModal({ mode: "create" });
  }

  async function openEditCourse(courseId: string) {
    setCourseForm(EMPTY_COURSE_FORM);
    setIsLoadingCourse(true);
    setCourseModal({ mode: "edit", courseId });
    try {
      const response = await fetch(`/api/admin/courses/${courseId}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Course load failed");
      const course = (await response.json()) as {
        title: string;
        description: string;
        category: string;
        level: string;
        price: number;
        duration: number;
        image: string | null;
        status: string;
        instructorId: string;
      };
      setCourseForm({
        title: course.title,
        description: course.description,
        category: course.category,
        level: course.level,
        price: String(course.price),
        duration: String(course.duration),
        image: course.image ?? "",
        status: course.status,
        instructorId: course.instructorId,
      });
    } catch {
      toast.error("Could not load this course");
      setCourseModal(null);
    } finally {
      setIsLoadingCourse(false);
    }
  }

  async function saveCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!courseModal) return;
    const courseId = courseModal.mode === "edit" ? courseModal.courseId : null;
    const editing = courseId !== null;
    setIsSavingCourse(true);
    try {
      const payload = {
        title: courseForm.title.trim(),
        description: courseForm.description.trim(),
        category: courseForm.category.trim(),
        level: courseForm.level,
        price: Number(courseForm.price),
        duration: Number(courseForm.duration),
        image: courseForm.image.trim(),
        status: courseForm.status,
        instructorId: courseForm.instructorId,
      };
      const response = await fetch(
        editing ? `/api/admin/courses/${courseId}` : "/api/admin/courses",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Course save failed");
      }
      toast.success(editing ? "Course updated" : "Course created");
      setCourseModal(null);
      await loadOverview(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the course",
      );
    } finally {
      setIsSavingCourse(false);
    }
  }

  async function deleteCourse(course: AdminOverview["recentCourses"][number]) {
    if (
      !await confirm({
        title: "Delete course",
        message: `Delete "${course.title}"? Its modules, lessons, quizzes and enrollments will be removed too.`,
      })
    )
      return;
    try {
      const response = await fetch(`/api/admin/courses/${course.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Course deletion failed");
      toast.success("Course deleted");
      await loadOverview(true);
    } catch {
      toast.error("Could not delete this course");
    }
  }

  async function updateUserRole(
    user: AdminOverview["recentUsers"][number],
    role: "STUDENT" | "INSTRUCTOR",
  ) {
    const name = `${user.firstName} ${user.lastName}`;
    if (
      !await confirm({
        title: "Confirm role change",
        message: role === "INSTRUCTOR"
          ? `Promote ${name} to instructor? They will be able to create and manage courses.`
          : `Demote ${name} back to student?`,
      })
    )
      return;
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Role update failed");
      }
      toast.success(
        role === "INSTRUCTOR"
          ? `${name} is now an instructor`
          : `${name} is now a student`,
      );
      await loadOverview(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update this role",
      );
    }
  }

  async function removeEnrollment(
    enrollment: AdminOverview["recentEnrollments"][number],
  ) {
    const name = `${enrollment.student.firstName} ${enrollment.student.lastName}`;
    if (
      !await confirm({
        title: "Remove enrollment",
        message: `Remove ${name} from "${enrollment.course.title}"? Their progress in this course will no longer count.`,
      })
    )
      return;
    try {
      const response = await fetch(`/api/admin/enrollments/${enrollment.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Enrollment removal failed");
      toast.success(`${name} removed from the course`);
      await loadOverview(true);
    } catch {
      toast.error("Could not remove this enrollment");
    }
  }

  async function sendAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSendingAnnouncement(true);
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: announceForm.title.trim(),
          message: announceForm.message.trim(),
          link: announceForm.link.trim(),
          audience: announceForm.audience,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        sent?: number;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(data?.error ?? "Sending failed");
      toast.success(
        `Announcement sent to ${data?.sent ?? 0} ${
          data?.sent === 1 ? "person" : "people"
        }`,
      );
      setAnnouncementOpen(false);
      setAnnounceForm({ title: "", message: "", link: "", audience: "ALL" });
      await loadOverview(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not send the announcement",
      );
    } finally {
      setIsSendingAnnouncement(false);
    }
  }

  async function updateInstructorStatus(user: {
    id: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
  }) {
    const name = `${user.firstName} ${user.lastName}`;
    if (
      !await confirm({
        title: "Confirm action",
        message: `${user.isActive ? "Deactivate" : "Reactivate"} ${name}'s instructor account?`,
      })
    )
      return;
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (!response.ok) throw new Error("Instructor update failed");
      toast.success(`Account ${user.isActive ? "deactivated" : "reactivated"}`);
      await loadOverview(true);
    } catch {
      toast.error("Could not update this instructor account");
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

  const assignableInstructors = overview.instructors.filter(
    (instructor) =>
      instructor.isActive || instructor.id === courseForm.instructorId,
  );

  return (
    <div className="admin-app">
      <Navbar />
      <main className="admin-shell">
        <aside className="admin-sidebar" aria-label="Admin navigation">
          <div className="admin-sidebar-label">WORKSPACE</div>
          {(Object.keys(viewLabels) as View[]).map((item) => {
            const Icon = viewIcons[item];
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
                  <button
                    type="button"
                    className="admin-shortcut admin-shortcut-button"
                    onClick={openCreateCourse}
                  >
                    <span className="admin-shortcut-icon">
                      <Plus size={17} />
                    </span>
                    <span>
                      <strong>Create a course</strong>
                      <small>Add new content to the catalog</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                  <button
                    type="button"
                    className="admin-shortcut admin-shortcut-button"
                    onClick={() => setAnnouncementOpen(true)}
                  >
                    <span className="admin-shortcut-icon">
                      <Megaphone size={17} />
                    </span>
                    <span>
                      <strong>Send an announcement</strong>
                      <small>Notify every learner at once</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
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
                  onRemove={removeEnrollment}
                />
              </section>
            </>
          ) : view === "live" ? (
            <section className="admin-panel admin-live-panel">
              <LiveClassManager
                mode="admin"
                courses={overview.recentCourses.map((course) => ({
                  id: course.id,
                  title: course.title,
                }))}
              />
            </section>
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
                        : view === "instructors"
                          ? `${overview.instructors.filter((entry) => entry.role === "INSTRUCTOR").length} instructors · ${metrics.instructorCount} active`
                          : view === "announcements"
                          ? `${overview.recentAnnouncements.length} announcements sent`
                          : `${metrics.enrollmentCount} total enrollments`}
                  </p>
                </div>
                <div className="admin-management-actions">
                  {view === "courses" && (
                    <button
                      className="admin-button admin-button-primary"
                      onClick={openCreateCourse}
                    >
                      <Plus size={16} />
                      <span>Add course</span>
                    </button>
                  )}
                  {view === "announcements" && (
                    <button
                      className="admin-button admin-button-primary"
                      onClick={() => setAnnouncementOpen(true)}
                    >
                      <Send size={16} />
                      <span>New announcement</span>
                    </button>
                  )}
                  <button
                    className="admin-button"
                    onClick={exportCsv}
                    title="Export visible records"
                  >
                    <ArrowDownToLine size={16} />
                    <span>Export CSV</span>
                  </button>
                </div>
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
                  onEdit={openEditCourse}
                  onDelete={deleteCourse}
                  onContent={setContentCourse}
                />
              ) : view === "students" ? (
                <StudentTable
                  items={filteredItems as AdminOverview["recentUsers"]}
                  onToggle={updateStudentStatus}
                  onPromote={updateUserRole}
                />
              ) : view === "instructors" ? (
                <InstructorTable
                  items={filteredItems as AdminOverview["instructors"]}
                  onToggle={updateInstructorStatus}
                  onDemote={updateUserRole}
                />
              ) : view === "enrollments" ? (
                <EnrollmentTable
                  items={filteredItems as AdminOverview["recentEnrollments"]}
                  onRemove={removeEnrollment}
                />
              ) : (
                <AnnouncementTable
                  items={filteredItems as AdminOverview["recentAnnouncements"]}
                />
              )}
              {filteredItems.length === 0 && (
                <div className="admin-no-results">
                  No matching records in the latest activity.
                </div>
              )}
              <div className="admin-table-foot">
                Showing up to{" "}
                {view === "enrollments"
                  ? 20
                  : view === "announcements"
                    ? 25
                    : 50}{" "}
                latest records.
                Dashboard data is read directly from your LMS database.
              </div>
            </section>
          )}
          {courseModal && (
            <div
              className="admin-modal-backdrop"
              onMouseDown={(event) => {
                if (
                  event.target === event.currentTarget &&
                  !isSavingCourse &&
                  !isLoadingCourse
                )
                  setCourseModal(null);
              }}
            >
              <div
                className="admin-modal"
                role="dialog"
                aria-modal="true"
                aria-label={
                  courseModal.mode === "edit" ? "Edit course" : "Create course"
                }
              >
                <div className="admin-modal-head">
                  <div>
                    <div className="admin-eyebrow">
                      {courseModal.mode === "edit"
                        ? "EDIT COURSE"
                        : "NEW COURSE"}
                    </div>
                    <h2>
                      {courseModal.mode === "edit"
                        ? "Update course details"
                        : "Create a course"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="admin-modal-close"
                    aria-label="Close"
                    onClick={() => setCourseModal(null)}
                    disabled={isSavingCourse}
                  >
                    <X size={15} />
                  </button>
                </div>
                {isLoadingCourse ? (
                  <div className="admin-modal-loading">
                    <LoaderCircle size={22} className="admin-spin" />
                    <span>Loading course...</span>
                  </div>
                ) : (
                  <form
                    className="instructor-form admin-modal-form"
                    onSubmit={saveCourse}
                  >
                    <label>
                      Course title
                      <input
                        value={courseForm.title}
                        minLength={4}
                        maxLength={120}
                        required
                        onChange={(event) =>
                          setCourseForm({
                            ...courseForm,
                            title: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Description
                      <textarea
                        value={courseForm.description}
                        minLength={20}
                        maxLength={5000}
                        required
                        placeholder="What will learners be able to make?"
                        onChange={(event) =>
                          setCourseForm({
                            ...courseForm,
                            description: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="instructor-form-row">
                      <label>
                        Category
                        <input
                          list="admin-course-categories"
                          value={courseForm.category}
                          minLength={2}
                          maxLength={60}
                          required
                          onChange={(event) =>
                            setCourseForm({
                              ...courseForm,
                              category: event.target.value,
                            })
                          }
                        />
                        <datalist id="admin-course-categories">
                          {COURSE_CATEGORIES.map((category) => (
                            <option key={category} value={category} />
                          ))}
                        </datalist>
                      </label>
                      <label>
                        Level
                        <select
                          value={courseForm.level}
                          onChange={(event) =>
                            setCourseForm({
                              ...courseForm,
                              level: event.target.value,
                            })
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
                        Price (USD)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={courseForm.price}
                          onChange={(event) =>
                            setCourseForm({
                              ...courseForm,
                              price: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Duration (hours)
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          step="1"
                          required
                          value={courseForm.duration}
                          onChange={(event) =>
                            setCourseForm({
                              ...courseForm,
                              duration: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="instructor-form-row">
                      <label>
                        Instructor
                        <select
                          value={courseForm.instructorId}
                          required
                          onChange={(event) =>
                            setCourseForm({
                              ...courseForm,
                              instructorId: event.target.value,
                            })
                          }
                        >
                          {assignableInstructors.map((instructor) => (
                            <option key={instructor.id} value={instructor.id}>
                              {instructor.firstName} {instructor.lastName}
                              {instructor.role === "ADMIN"
                                ? " (Admin)"
                                : instructor.isActive
                                  ? ""
                                  : " (Deactivated)"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Status
                        <select
                          value={courseForm.status}
                          onChange={(event) =>
                            setCourseForm({
                              ...courseForm,
                              status: event.target.value,
                            })
                          }
                        >
                          <option value="DRAFT">Draft</option>
                          <option value="PUBLISHED">Published</option>
                        </select>
                      </label>
                    </div>
                    <ImageUploadField
                      value={courseForm.image}
                      onChange={(image) =>
                        setCourseForm({ ...courseForm, image })
                      }
                    />
                    <div className="admin-modal-actions">
                      <button
                        type="button"
                        className="admin-button"
                        onClick={() => setCourseModal(null)}
                        disabled={isSavingCourse}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="admin-button admin-button-primary"
                        disabled={isSavingCourse || !courseForm.instructorId}
                      >
                        {isSavingCourse ? (
                          <LoaderCircle size={15} className="admin-spin" />
                        ) : courseModal.mode === "edit" ? (
                          <Check size={15} />
                        ) : (
                          <Plus size={15} />
                        )}
                        <span>
                          {isSavingCourse
                            ? "Saving..."
                            : courseModal.mode === "edit"
                              ? "Save changes"
                              : "Create course"}
                        </span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
          {announcementOpen && (
            <div
              className="admin-modal-backdrop"
              onMouseDown={(event) => {
                if (
                  event.target === event.currentTarget &&
                  !isSendingAnnouncement
                )
                  setAnnouncementOpen(false);
              }}
            >
              <div
                className="admin-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Send an announcement"
              >
                <div className="admin-modal-head">
                  <div>
                    <div className="admin-eyebrow">NEW ANNOUNCEMENT</div>
                    <h2>Send an announcement</h2>
                  </div>
                  <button
                    type="button"
                    className="admin-modal-close"
                    aria-label="Close"
                    onClick={() => setAnnouncementOpen(false)}
                    disabled={isSendingAnnouncement}
                  >
                    <X size={15} />
                  </button>
                </div>
                <form
                  className="instructor-form admin-modal-form"
                  onSubmit={sendAnnouncement}
                >
                  <label>
                    Title
                    <input
                      value={announceForm.title}
                      minLength={3}
                      maxLength={120}
                      required
                      placeholder="New course launch!"
                      onChange={(event) =>
                        setAnnounceForm({
                          ...announceForm,
                          title: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Message
                    <textarea
                      value={announceForm.message}
                      minLength={10}
                      maxLength={1000}
                      required
                      placeholder="Tell your learners what is new..."
                      onChange={(event) =>
                        setAnnounceForm({
                          ...announceForm,
                          message: event.target.value,
                        })
                      }
                    />
                  </label>
                  <div className="instructor-form-row">
                    <label>
                      Audience
                      <select
                        value={announceForm.audience}
                        onChange={(event) =>
                          setAnnounceForm({
                            ...announceForm,
                            audience: event.target.value,
                          })
                        }
                      >
                        <option value="ALL">Everyone</option>
                        <option value="STUDENT">Students only</option>
                        <option value="INSTRUCTOR">Instructors only</option>
                      </select>
                    </label>
                    <label>
                      Link{" "}
                      <span className="instructor-optional">Optional</span>
                      <input
                        type="url"
                        value={announceForm.link}
                        placeholder="https://..."
                        onChange={(event) =>
                          setAnnounceForm({
                            ...announceForm,
                            link: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="admin-modal-actions">
                    <button
                      type="button"
                      className="admin-button"
                      onClick={() => setAnnouncementOpen(false)}
                      disabled={isSendingAnnouncement}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="admin-button admin-button-primary"
                      disabled={isSendingAnnouncement}
                    >
                      {isSendingAnnouncement ? (
                        <LoaderCircle size={15} className="admin-spin" />
                      ) : (
                        <Send size={15} />
                      )}
                      <span>
                        {isSendingAnnouncement ? "Sending..." : "Send now"}
                      </span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
          {contentCourse && (
            <div
              className="admin-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget)
                  setContentCourse(null);
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
                    onChanged={() => void loadOverview(true)}
                  />
                </div>
              </div>
            </div>
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
  onEdit,
  onDelete,
  onContent,
}: {
  items: AdminOverview["recentCourses"];
  onToggle: (id: string, status: string) => void;
  onEdit: (id: string) => void;
  onDelete: (course: AdminOverview["recentCourses"][number]) => void;
  onContent: (course: { id: string; title: string }) => void;
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
                <div className="admin-row-actions">
                  <button
                    className="admin-row-action"
                    onClick={() => onContent(course)}
                  >
                    Content
                  </button>
                  <button
                    className="admin-row-action"
                    onClick={() => onToggle(course.id, course.status)}
                  >
                    {course.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    className="admin-row-action"
                    onClick={() => onEdit(course.id)}
                  >
                    Edit
                  </button>
                  <button
                    className="admin-row-action is-danger"
                    onClick={() => onDelete(course)}
                  >
                    Delete
                  </button>
                </div>
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
  onPromote,
}: {
  items: AdminOverview["recentUsers"];
  onToggle: (id: string, isActive: boolean) => void;
  onPromote: (
    user: AdminOverview["recentUsers"][number],
    role: "STUDENT" | "INSTRUCTOR",
  ) => void;
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
                  {user.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar} alt="" />
                  ) : (
                    <>
                      {user.firstName[0]}
                      {user.lastName[0]}
                    </>
                  )}
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
                <div className="admin-row-actions">
                  <button
                    className="admin-row-action"
                    onClick={() => onToggle(user.id, user.isActive)}
                  >
                    {user.isActive ? "Deactivate" : "Reactivate"}
                  </button>
                  <button
                    className="admin-row-action"
                    onClick={() => onPromote(user, "INSTRUCTOR")}
                  >
                    Make instructor
                  </button>
                </div>
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
  onRemove,
}: {
  items: AdminOverview["recentEnrollments"];
  onRemove: (enrollment: AdminOverview["recentEnrollments"][number]) => void;
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
            <th>Action</th>
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
              <td>
                <div className="admin-row-actions">
                  <button
                    className="admin-row-action is-danger"
                    onClick={() => onRemove(enrollment)}
                  >
                    Remove
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnnouncementTable({
  items,
}: {
  items: AdminOverview["recentAnnouncements"];
}) {
  return (
    <div className="admin-table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Announcement</th>
            <th>Recipients</th>
            <th>Sent</th>
          </tr>
        </thead>
        <tbody>
          {items.map((announcement) => (
            <tr key={announcement.id}>
              <td>
                <strong>{announcement.title}</strong>
                <small className="admin-announcement-message">
                  {announcement.message}
                </small>
                {announcement.link && (
                  <a
                    href={announcement.link}
                    target="_blank"
                    rel="noreferrer"
                    className="admin-course-link"
                  >
                    {announcement.link}
                  </a>
                )}
              </td>
              <td>
                <span className="admin-pill is-muted">
                  {announcement.recipients.toLocaleString()} notified
                </span>
              </td>
              <td>{new Date(announcement.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InstructorTable({
  items,
  onToggle,
  onDemote,
}: {
  items: AdminOverview["instructors"];
  onToggle: (user: {
    id: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
  }) => void;
  onDemote: (
    user: AdminOverview["recentUsers"][number],
    role: "STUDENT" | "INSTRUCTOR",
  ) => void;
}) {
  return (
    <div className="admin-table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Instructor</th>
            <th>Email</th>
            <th>Courses</th>
            <th>Joined</th>
            <th>Account</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((instructor) => (
            <tr key={instructor.id}>
              <td>
                <span className="admin-avatar">
                  {instructor.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={instructor.avatar} alt="" />
                  ) : (
                    <>
                      {instructor.firstName[0]}
                      {instructor.lastName[0]}
                    </>
                  )}
                </span>
                <strong>
                  {instructor.firstName} {instructor.lastName}
                </strong>
              </td>
              <td>{instructor.email}</td>
              <td>{instructor._count.createdCourses}</td>
              <td>{new Date(instructor.createdAt).toLocaleDateString()}</td>
              <td>
                <span
                  className={`admin-pill ${instructor.isActive ? "is-good" : "is-muted"}`}
                >
                  {instructor.isActive ? "Active" : "Inactive"}
                </span>
              </td>
              <td>
                <div className="admin-row-actions">
                  <button
                    className="admin-row-action"
                    onClick={() => onToggle(instructor)}
                  >
                    {instructor.isActive ? "Deactivate" : "Reactivate"}
                  </button>
                  <button
                    className="admin-row-action"
                    onClick={() => onDemote(instructor, "STUDENT")}
                  >
                    Make student
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
