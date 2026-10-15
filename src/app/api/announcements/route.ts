import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getAnnouncements } from "@/lib/page-cache";

// GET public announcements — no auth required so registered
// AND non-registered visitors can read them.
export async function GET() {
  try {
    // Public and identical for every visitor — cache it globally. Sending or
    // deleting an announcement calls invalidateAnnouncements().
    const { announcements } = await getAnnouncements(async () => ({
      announcements: await prisma.announcement.findMany({
        where: { published: true },
        select: {
          id: true,
          title: true,
          message: true,
          link: true,
          audience: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    }));
    return NextResponse.json({ announcements });
  } catch (error) {
    console.error("Public announcements error:", error);
    return NextResponse.json(
      { error: "Failed to load announcements" },
      { status: 500 },
    );
  }
}
