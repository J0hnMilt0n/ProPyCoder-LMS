// Shared helpers for online live classes (scheduled video sessions).

export const LIVE_CLASS_PROVIDERS = [
  "GOOGLE_MEET",
  "ZOOM",
  "TEAMS",
  "OTHER",
] as const;

export type LiveClassProvider = (typeof LIVE_CLASS_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<string, string> = {
  GOOGLE_MEET: "Google Meet",
  ZOOM: "Zoom",
  TEAMS: "Microsoft Teams",
  OTHER: "Other link",
};

export type LiveClassStatus = "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";

export const STATUS_LABELS: Record<LiveClassStatus, string> = {
  SCHEDULED: "Scheduled",
  LIVE: "Live now",
  ENDED: "Ended",
  CANCELLED: "Cancelled",
};

type LiveClassTimes = {
  status: string;
  startsAt: Date | string;
  endsAt: Date | string;
};

// The stored status only tracks explicit actions (cancel/end/start).
// "SCHEDULED" rows flip to LIVE/ENDED purely based on the clock, so the
// schedule stays accurate even if nobody clicks "End".
export function effectiveStatus(
  row: LiveClassTimes,
  now: Date = new Date(),
): LiveClassStatus {
  if (row.status === "CANCELLED" || row.status === "ENDED") return row.status;
  const startsAt = new Date(row.startsAt).getTime();
  const endsAt = new Date(row.endsAt).getTime();
  if (row.status === "LIVE") {
    return now.getTime() > endsAt ? "ENDED" : "LIVE";
  }
  if (now.getTime() < startsAt) return "SCHEDULED";
  if (now.getTime() <= endsAt) return "LIVE";
  return "ENDED";
}

type LiveClassRecord = LiveClassTimes & {
  id: string;
  title: string;
  description: string | null;
  provider: string;
  meetingUrl: string;
  meetingId: string | null;
  passcode: string | null;
  courseId: string;
  instructorId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  course?: { id: string; title: string };
  instructor?: { id: string; firstName: string; lastName: string };
};

export type SerializedLiveClass = {
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
  createdAt: string;
  course?: { id: string; title: string };
  instructor?: { id: string; firstName: string; lastName: string };
};

export function serializeLiveClass(
  row: LiveClassRecord,
): SerializedLiveClass {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    provider: row.provider,
    meetingUrl: row.meetingUrl,
    meetingId: row.meetingId,
    passcode: row.passcode,
    startsAt: new Date(row.startsAt).toISOString(),
    endsAt: new Date(row.endsAt).toISOString(),
    status: effectiveStatus(row),
    storedStatus: row.status,
    courseId: row.courseId,
    instructorId: row.instructorId,
    createdAt: new Date(row.createdAt).toISOString(),
    course: row.course,
    instructor: row.instructor,
  };
}
