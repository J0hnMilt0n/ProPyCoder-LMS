import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NS, userCached } from "@/lib/page-cache";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// Minimal per-user ownership read for catalog badges.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const courseIds = await userCached(
      NS.purchasedCourses,
      session.user.id,
      async () => {
        const enrollments = await prisma.enrollment.findMany({
          where: { studentId: session.user.id },
          select: { courseId: true },
        });
        return enrollments.map(({ courseId }) => courseId);
      },
    );

    return NextResponse.json({ courseIds });
  } catch (error) {
    logger.error("Purchased courses fetch error", {
      cause: error instanceof Error ? error : undefined,
      metadata: { error: String(error) },
    });
    return NextResponse.json(
      { error: "Failed to fetch purchased courses" },
      { status: 500 },
    );
  }
}
