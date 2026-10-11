import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET public announcements — no auth required so registered
// AND non-registered visitors can read them.
export async function GET() {
  try {
    const announcements = await prisma.announcement.findMany({
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
    });
    return NextResponse.json({ announcements });
  } catch (error) {
    console.error("Public announcements error:", error);
    return NextResponse.json(
      { error: "Failed to load announcements" },
      { status: 500 },
    );
  }
}
