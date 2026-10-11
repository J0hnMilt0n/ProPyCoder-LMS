import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const announcementInput = z.object({
  title: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(1000),
  link: z.union([z.string().url(), z.literal("")]).optional(),
  audience: z.enum(["ALL", "STUDENT", "INSTRUCTOR"]).optional(),
});

// POST send an announcement to every matching active user (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = announcementInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Add a title and a message before sending" },
        { status: 400 },
      );
    }

    const { title, message, link, audience = "ALL" } = parsed.data;
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        ...(audience !== "ALL" ? { role: audience } : {}),
      },
      select: { id: true },
    });

    if (users.length > 0) {
      await prisma.notification.createMany({
        data: users.map((user) => ({
          userId: user.id,
          title,
          message,
          link: link || null,
          type: "ANNOUNCEMENT",
        })),
      });
    }

    return NextResponse.json({ sent: users.length }, { status: 201 });
  } catch (error) {
    console.error("Admin announcement error:", error);
    return NextResponse.json(
      { error: "Failed to send announcement" },
      { status: 500 },
    );
  }
}