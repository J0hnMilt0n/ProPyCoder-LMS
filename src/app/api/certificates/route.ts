import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/route";
import { NS, userCached } from "@/lib/page-cache";

// GET the current user's certificates (one per completed course).
export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Per-user — cached in-process keyed by the user id. Completing a course
    // (progress POST) invalidates it so a newly issued certificate appears.
    const { data } = await userCached(
      NS.certificates,
      session.user.id,
      async () => ({
        data: await prisma.certificate.findMany({
          where: { studentId: session.user.id },
          orderBy: { issueDate: "desc" },
          select: {
            id: true,
            course: true,
            issueDate: true,
            certificateNumber: true,
          },
        }),
      }),
    );

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Certificates fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch certificates" },
      { status: 500 },
    );
  }
}
