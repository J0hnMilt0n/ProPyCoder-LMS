"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CircleSlash,
  ExternalLink,
  LoaderCircle,
  Pencil,
  Play,
  Plus,
  Trash2,
  Video,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { useConfirm } from "@/components/confirm-dialog";
import {
  PROVIDER_LABELS,
  STATUS_LABELS,
  effectiveStatus,
  type LiveClassStatus,
} from "@/lib/live-classes";

export type LiveClassOption = { id: string; title: string };

type LiveClassRow = {
  id: string;
  title: string;
  description: string | null;
  provider: string;
  meetingUrl: string;
  meetingId: string | null;
  passcode: string | null;
  startsAt: string;
  endsAt: string;
  status: LiveClassStatus;
  storedStatus: string;
  courseId: string;
  instructorId: string;
  course?: { id: string; title: string };
  instructor?: { id: string; firstName: string; lastName: string };
};

const emptyForm = {
  courseId: "",
  courseTitle: "",
  title: "",
  description: "",
  provider: "GOOGLE_MEET",
  meetingUrl: "",
  meetingId: "",
  passcode: "",
  date: "",
  time: "",
  duration: "60",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toLocalInputs(iso: string) {
  const date = new Date(iso);
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function statusRank(status: LiveClassStatus) {
  if (status === "LIVE") return 0;
  if (status === "SCHEDULED") return 1;
  if (status === "ENDED") return 2;
  return 3;
}

interface LiveClassManagerProps {
  courses: LiveClassOption[];
  mode: "instructor" | "admin";
  onChanged?: () => void;
}

export function LiveClassManager({
  courses,
  mode,
  onChanged,
}: LiveClassManagerProps) {
  const confirm = useConfirm();
  const [classes, setClasses] = useState<LiveClassRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modal, setModal] = useState<
    { mode: "create" } | { mode: "edit"; id: string } | null
  >(null);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick so SCHEDULED rows flip to LIVE/ENDED without a manual refresh.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/live-classes?scope=manage", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not load live classes");
      const result = await response.json();
      setClasses(result.data ?? []);
    } catch {
      toast.error("Could not load live classes");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusOf = (row: LiveClassRow): LiveClassStatus =>
    effectiveStatus(
      { status: row.storedStatus, startsAt: row.startsAt, endsAt: row.endsAt },
      new Date(now),
    );

  function openCreate() {
    const start = new Date(Date.now() + 60 * 60 * 1000);
    setForm({
      ...emptyForm,
      courseId: courses[0]?.id ?? "",
      courseTitle: courses[0]?.title ?? "",
      date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
      time: `${pad(start.getHours())}:00`,
    });
    setModal({ mode: "create" });
  }

  function openEdit(row: LiveClassRow) {
    const start = toLocalInputs(row.startsAt);
    const minutes = Math.max(
      1,
      Math.round(
        (new Date(row.endsAt).getTime() - new Date(row.startsAt).getTime()) /
          60_000,
      ),
    );
    setForm({
      courseId: row.courseId,
      courseTitle: row.course?.title ?? "",
      title: row.title,
      description: row.description ?? "",
      provider: row.provider,
      meetingUrl: row.meetingUrl,
      meetingId: row.meetingId ?? "",
      passcode: row.passcode ?? "",
      date: start.date,
      time: start.time,
      duration: String(minutes),
    });
    setModal({ mode: "edit", id: row.id });
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || !modal) return;
    if (!form.courseId) {
      toast.error("Choose a course");
      return;
    }
    const startsAt = new Date(`${form.date}T${form.time}`);
    const durationMinutes = Number(form.duration);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(durationMinutes)) {
      toast.error("Pick a valid date, time and duration");
      return;
    }
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    if (endsAt.getTime() <= startsAt.getTime()) {
      toast.error("The duration must be at least 1 minute");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        courseId: form.courseId,
        title: form.title.trim(),
        description: form.description.trim(),
        provider: form.provider,
        meetingUrl: form.meetingUrl.trim(),
        meetingId: form.meetingId.trim(),
        passcode: form.passcode.trim(),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      };
      const isEdit = modal.mode === "edit";
      const response = await fetch(
        isEdit ? `/api/live-classes/${modal.id}` : "/api/live-classes",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response
        .json()
        .catch(() => ({}) as Record<string, string>);
      if (!response.ok) {
        throw new Error(result.error || "Could not save the live class");
      }
      toast.success(isEdit ? "Live class updated" : "Live class scheduled");
      setModal(null);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the live class",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function setStatus(row: LiveClassRow, status: LiveClassStatus) {
    setBusyId(row.id);
    try {
      const response = await fetch(`/api/live-classes/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response
        .json()
        .catch(() => ({}) as Record<string, string>);
      if (!response.ok) {
        throw new Error(result.error || "Could not update the live class");
      }
      toast.success(
        status === "LIVE"
          ? "Live class started"
          : status === "ENDED"
            ? "Live class ended"
            : "Live class updated",
      );
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update the live class",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function cancelRow(row: LiveClassRow) {
    const ok = await confirm({
      title: "Cancel live class",
      message: `Cancel "${row.title}"? Students will see it as cancelled.`,
      confirmLabel: "Cancel class",
      danger: true,
    });
    if (!ok) return;
    await setStatus(row, "CANCELLED");
  }

  async function removeRow(row: LiveClassRow) {
    const ok = await confirm({
      title: "Delete live class",
      message: `Delete "${row.title}" permanently?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      const response = await fetch(`/api/live-classes/${row.id}`, {
        method: "DELETE",
      });
      const result = await response
        .json()
        .catch(() => ({}) as Record<string, string>);
      if (!response.ok) {
        throw new Error(result.error || "Could not delete the live class");
      }
      toast.success("Live class deleted");
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not delete the live class",
      );
    } finally {
      setBusyId(null);
    }
  }


  if (isLoading) {
    return (
      <div className="live-manager is-loading">
        <LoaderCircle size={24} className="admin-spin" />
        <span>Loading live classes...</span>
      </div>
    );
  }

  const sorted = [...classes].sort((a, b) => {
    const rankDiff = statusRank(statusOf(a)) - statusRank(statusOf(b));
    if (rankDiff !== 0) return rankDiff;
    const aStart = new Date(a.startsAt).getTime();
    const bStart = new Date(b.startsAt).getTime();
    // Upcoming first (soonest), past most recent first.
    return statusRank(statusOf(a)) <= 1 ? aStart - bStart : bStart - aStart;
  });
  const liveCount = classes.filter((row) => statusOf(row) === "LIVE").length;
  const upcomingCount = classes.filter(
    (row) => statusOf(row) === "SCHEDULED",
  ).length;

  return (
    <div className="live-manager">
      <div className="live-manager-head">
        <div>
          <div className="admin-eyebrow">LIVE CLASSES</div>
          <h2>Online live classes</h2>
          <p>
            {liveCount > 0 ? `${liveCount} live now · ` : ""}
            {upcomingCount} scheduled · {classes.length} total
          </p>
        </div>
        <button
          type="button"
          className="admin-button admin-button-primary"
          onClick={openCreate}
          disabled={courses.length === 0}
          title={
            courses.length === 0
              ? "Create a course first"
              : "Schedule a live class"
          }
        >
          <Plus size={16} />
          <span>Schedule live class</span>
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="live-manager-empty">
          <Video size={28} />
          <strong>No live classes yet</strong>
          <span>
            Schedule a session — enrolled students will see it on the course
            page and their dashboard with a one-click join link.
          </span>
        </div>
      ) : (

        <div className="live-list">
          {sorted.map((row) => {
            const status = statusOf(row);
            const start = new Date(row.startsAt);
            const end = new Date(row.endsAt);
            const isBusy = busyId === row.id;
            return (
              <article
                key={row.id}
                className={`live-row is-${status.toLowerCase()}`}
              >
                <div className="live-row-date">
                  <span>
                    {start.toLocaleDateString(undefined, { month: "short" })}
                  </span>
                  <strong>{start.getDate()}</strong>
                  <small>
                    {start.toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </div>
                <div className="live-row-main">
                  <div className="live-row-title">
                    <h3>{row.title}</h3>
                    <span className={`live-pill is-${status.toLowerCase()}`}>
                      {status === "LIVE" && <span className="live-pill-dot" />}
                      {STATUS_LABELS[status]}
                    </span>
                  </div>
                  <p className="live-row-meta">
                    {row.course?.title ?? "Course"}
                    {mode === "admin" && row.instructor
                      ? ` · ${row.instructor.firstName} ${row.instructor.lastName}`
                      : ""}
                    {" · "}
                    {PROVIDER_LABELS[row.provider] ?? row.provider}
                    {" · "}
                    {start.toLocaleDateString()}{" "}
                    {start.toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" – "}
                    {end.toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {row.description && (
                    <p className="live-row-desc">{row.description}</p>
                  )}
                  {(row.meetingId || row.passcode) && (
                    <p className="live-row-code">
                      {row.meetingId && (
                        <span>
                          Meeting ID <code>{row.meetingId}</code>
                        </span>
                      )}
                      {row.passcode && (
                        <span>
                          Passcode <code>{row.passcode}</code>
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div className="live-row-actions">
                  {(status === "SCHEDULED" || status === "LIVE") && (
                    <a
                      className="live-action is-primary"
                      href={row.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink size={14} /> Join
                    </a>
                  )}
                  {status === "SCHEDULED" && (
                    <button
                      type="button"
                      className="live-action"
                      disabled={isBusy}
                      onClick={() => void setStatus(row, "LIVE")}
                    >
                      <Play size={14} /> Start
                    </button>
                  )}
                  {status === "LIVE" && (
                    <button
                      type="button"
                      className="live-action"
                      disabled={isBusy}
                      onClick={() => void setStatus(row, "ENDED")}
                    >
                      <CircleSlash size={14} /> End
                    </button>
                  )}
                  {status === "SCHEDULED" && (
                    <button
                      type="button"
                      className="live-action"
                      disabled={isBusy}
                      onClick={() => void cancelRow(row)}
                    >
                      <X size={14} /> Cancel
                    </button>
                  )}
                  <button
                    type="button"
                    className="live-action"
                    disabled={isBusy}
                    onClick={() => openEdit(row)}
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  <button
                    type="button"
                    className="live-action is-danger"
                    disabled={isBusy}
                    onClick={() => void removeRow(row)}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {modal && (
        <div
          className="admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSaving)
              setModal(null);
          }}
        >
          <div
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal.mode === "edit" ? "Edit live class" : "Schedule live class"
            }
          >
            <div className="admin-modal-head">
              <div>
                <div className="admin-eyebrow">
                  {modal.mode === "edit"
                    ? "EDIT LIVE CLASS"
                    : "NEW LIVE CLASS"}
                </div>
                <h2>
                  {modal.mode === "edit"
                    ? "Update live class"
                    : "Schedule a live class"}
                </h2>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                aria-label="Close"
                disabled={isSaving}
                onClick={() => setModal(null)}
              >
                <X size={15} />
              </button>
            </div>
            <form
              className="instructor-form admin-modal-form"
              onSubmit={submitForm}
            >
              <label>
                Course
                {modal.mode === "edit" ? (
                  <input value={form.courseTitle || form.courseId} disabled />
                ) : (
                  <select
                    value={form.courseId}
                    required
                    onChange={(event) => {
                      const selected = courses.find(
                        (course) => course.id === event.target.value,
                      );
                      setForm({
                        ...form,
                        courseId: event.target.value,
                        courseTitle: selected?.title ?? "",
                      });
                    }}
                  >
                    <option value="" disabled>
                      Select a course
                    </option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label>
                Title
                <input
                  value={form.title}
                  required
                  minLength={3}
                  maxLength={120}
                  placeholder="Live Q&A: React hooks deep dive"
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
              </label>
              <label>
                Description{" "}
                <span className="instructor-optional">Optional</span>
                <textarea
                  value={form.description}
                  maxLength={1000}
                  rows={2}
                  placeholder="What will you cover in this session?"
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </label>
              <div className="instructor-form-row">
                <label>
                  Platform
                  <select
                    value={form.provider}
                    onChange={(event) =>
                      setForm({ ...form, provider: event.target.value })
                    }
                  >
                    <option value="GOOGLE_MEET">Google Meet</option>
                    <option value="ZOOM">Zoom</option>
                    <option value="TEAMS">Microsoft Teams</option>
                    <option value="OTHER">Other link</option>
                  </select>
                </label>
                <label>
                  Meeting link
                  <input
                    type="url"
                    value={form.meetingUrl}
                    required
                    placeholder="https://meet.google.com/..."
                    onChange={(event) =>
                      setForm({ ...form, meetingUrl: event.target.value })
                    }
                  />
                </label>
              </div>
              <div className="instructor-form-row">
                <label>
                  Meeting ID <span className="instructor-optional">Optional</span>
                  <input
                    value={form.meetingId}
                    maxLength={80}
                    placeholder="abc-defg-hij"
                    onChange={(event) =>
                      setForm({ ...form, meetingId: event.target.value })
                    }
                  />
                </label>
                <label>
                  Passcode <span className="instructor-optional">Optional</span>
                  <input
                    value={form.passcode}
                    maxLength={80}
                    placeholder="123456"
                    onChange={(event) =>
                      setForm({ ...form, passcode: event.target.value })
                    }
                  />
                </label>
              </div>
              <div className="instructor-form-row">
                <label>
                  Date
                  <input
                    type="date"
                    value={form.date}
                    required
                    onChange={(event) =>
                      setForm({ ...form, date: event.target.value })
                    }
                  />
                </label>
                <label>
                  Start time
                  <input
                    type="time"
                    value={form.time}
                    required
                    onChange={(event) =>
                      setForm({ ...form, time: event.target.value })
                    }
                  />
                </label>
                <label>
                  Duration (min)
                  <input
                    type="number"
                    min={5}
                    max={600}
                    step={5}
                    value={form.duration}
                    required
                    onChange={(event) =>
                      setForm({ ...form, duration: event.target.value })
                    }
                  />
                </label>
              </div>
              <button
                type="submit"
                className="instructor-submit"
                disabled={isSaving}
              >
                {isSaving ? (
                  <LoaderCircle size={15} className="admin-spin" />
                ) : (
                  <Video size={16} />
                )}
                {isSaving
                  ? "Saving..."
                  : modal.mode === "edit"
                    ? "Save changes"
                    : "Schedule class"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

