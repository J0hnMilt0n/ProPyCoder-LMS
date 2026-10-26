import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Minimal per-user ownership read for catalog badges.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: session.user.id },
      select: { courseId: true },
    });

    return NextResponse.json({ courseIds: enrollments.map(({ courseId }) => courseId) });
  } catch (error) {
    console.error("Purchased courses fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch purchased courses" },
      { status: 500 },
    );
  }
}