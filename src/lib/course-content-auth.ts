import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export type ContentAccess =
  | { ok: true; isAdmin: boolean }
  | { ok: false; status: number; error: string };

/**
 * Checks whether the current session may manage the content of a course.
 * Admins can manage any course; instructors only their own.
 */
export async function authorizeCourseContent(
  courseId: string,
): Promise<ContentAccess> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  if (session.user.role === "ADMIN") {
    return { ok: true, isAdmin: true };
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, instructorId: true },
  });
  if (!course) {
    return { ok: false, status: 404, error: "Course not found" };
  }
  if (session.user.role === "INSTRUCTOR" && course.instructorId === session.user.id) {
    return { ok: true, isAdmin: false };
  }
  return {
    ok: false,
    status: 403,
    error: "You can only manage content for your own courses",
  };
}