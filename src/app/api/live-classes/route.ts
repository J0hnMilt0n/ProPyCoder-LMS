import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { effectiveStatus, serializeLiveClass } from "@/lib/live-classes";
import { LIVE_CACHE, NS, invalidateUser, userCached } from "@/lib/page-cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const liveClassInput = z.object({
  courseId: z.string().trim().min(1),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).optional(),
  provider: z.enum(["GOOGLE_MEET", "ZOOM", "TEAMS", "OTHER"]),
  meetingUrl: z.string().url().max(500),
  meetingId: z.string().trim().max(80).optional(),
  passcode: z.string().trim().max(80).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
});

const liveClassInclude = {
  course: { select: { id: true, title: true } },
  instructor: { select: { id: true, firstName: true, lastName: true } },
} as const;

// Public listings intentionally exclude every field that could expose a
// meeting URL, meeting ID, or passcode. Meeting access remains authenticated.
const publicLiveClassSelect = {
  id: true,
  title: true,
  description: true,
  provider: true,
  startsAt: true,
  endsAt: true,
  status: true,
  courseId: true,
  course: { select: { id: true, title: true } },
  instructor: { select: { firstName: true, lastName: true } },
} as const;

// GET /api/live-classes?scope=manage   → instructor's own / all (admin)
// GET /api/live-classes?scope=mine     → classes in my enrolled courses
// GET /api/live-classes?courseId=...   → classes for one course (access-checked)
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    const courseId = url.searchParams.get("courseId");
    if (scope === "public") {
      const rows = await prisma.liveClass.findMany({
        where: {
          status: { not: "CANCELLED" },
          endsAt: { gte: new Date() },
          course: { status: "PUBLISHED" },
        },
        select: publicLiveClassSelect,
        orderBy: { startsAt: "asc" },
        take: 100,
      });
      const data = rows.map((row) => ({
        ...row,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        status: effectiveStatus(row),
      }));
      return NextResponse.json({ data });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = session.user.role;

    if (courseId) {
      // Course lookup + enrollment check are independent — run them
      // together to save a round trip against the remote database.
      const [course, enrollment] = await Promise.all([
        prisma.course.findUnique({
          where: { id: courseId },
          select: { id: true, instructorId: true },
        }),
        prisma.enrollment.findFirst({
          where: { courseId, studentId: session.user.id },
          select: { id: true },
        }),
      ]);
      if (!course) {
        return NextResponse.json({ error: "Course not found" }, { status: 404 });
      }
      const allowed =
        role === "ADMIN" ||
        course.instructorId === session.user.id ||
        Boolean(enrollment);
      if (!allowed) {
        return NextResponse.json(
          { error: "Enroll in this course to see its live classes" },
          { status: 403 },
        );
      }
      const rows = await userCached(
        NS.liveClasses,
        session.user.id,
        async () =>
          prisma.liveClass.findMany({
            where: { courseId },
            include: liveClassInclude,
            orderBy: { startsAt: "asc" },
            take: 100,
          }),
        LIVE_CACHE,
        `course:${courseId}`,
      );
      return NextResponse.json({ data: rows.map(serializeLiveClass) });
    }

    if (scope === "manage") {
      if (role !== "ADMIN" && role !== "INSTRUCTOR") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const rows = await userCached(
        NS.liveClasses,
        session.user.id,
        async () =>
          prisma.liveClass.findMany({
            where: role === "ADMIN" ? {} : { instructorId: session.user.id },
            include: liveClassInclude,
            orderBy: { startsAt: "asc" },
            take: 100,
          }),
        LIVE_CACHE,
        `manage:${role}`,
      );
      return NextResponse.json({ data: rows.map(serializeLiveClass) });
    }

    if (scope === "mine") {
      const rows = await userCached(
        NS.liveClasses,
        session.user.id,
        async () => {
          const enrollments = await prisma.enrollment.findMany({
            where: { studentId: session.user.id },
            select: { courseId: true },
          });
          const courseIds = enrollments.map((entry) => entry.courseId);
          if (courseIds.length === 0) return [];
          return prisma.liveClass.findMany({
            where: {
              courseId: { in: courseIds },
              // Live now or still upcoming (keep the last hour so "Live" lingers).
              endsAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
            },
            include: liveClassInclude,
            orderBy: { startsAt: "asc" },
            take: 50,
          });
        },
        LIVE_CACHE,
        "mine",
      );
      return NextResponse.json({ data: rows.map(serializeLiveClass) });
    }

    return NextResponse.json(
      { error: "Unknown scope. Use scope=manage, scope=mine or courseId." },
      { status: 400 },
    );
  } catch (error) {
    console.error("Live classes GET error:", error);
    return NextResponse.json(
      { error: "Could not load live classes" },
      { status: 500 },
    );
  }
}

// POST /api/live-classes — schedule a class (instructor owns the course, admin any)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (
      session?.user?.role !== "INSTRUCTOR" &&
      session?.user?.role !== "ADMIN"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = liveClassInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check the live class fields and try again" },
        { status: 400 },
      );
    }
    const data = parsed.data;
    if (data.endsAt.getTime() <= data.startsAt.getTime()) {
      return NextResponse.json(
        { error: "The end time must be after the start time" },
        { status: 400 },
      );
    }

    const course = await prisma.course.findUnique({
      where: { id: data.courseId },
      select: { id: true, title: true, instructorId: true },
    });
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }
    if (
      session.user.role !== "ADMIN" &&
      course.instructorId !== session.user.id
    ) {
      return NextResponse.json(
        { error: "You can only schedule classes for your own courses" },
        { status: 403 },
      );
    }

    const created = await prisma.liveClass.create({
      data: {
        title: data.title,
        description: data.description || null,
        provider: data.provider,
        meetingUrl: data.meetingUrl,
        meetingId: data.meetingId || null,
        passcode: data.passcode || null,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        courseId: course.id,
        // Admin-scheduled classes still belong to the course's instructor.
        instructorId: course.instructorId,
      },
      include: liveClassInclude,
    });

    // A newly scheduled class shows up in the course's list for everyone who
    // can see it, and in the instructor's manage list.
    invalidateUser(NS.liveClasses, session.user.id);

    return NextResponse.json(
      { data: serializeLiveClass(created) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Live class POST error:", error);
    return NextResponse.json(
      { error: "Could not schedule the live class" },
      { status: 500 },
    );
  }
}
