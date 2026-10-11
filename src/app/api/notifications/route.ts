import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET the signed-in user's personal notification inbox (incl. unread count)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: session.user.id },
        select: {
          id: true,
          title: true,
          message: true,
          link: true,
          type: true,
          read: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({
        where: { userId: session.user.id, read: false },
      }),
    ]);
    return NextResponse.json({ notifications, unread });
  } catch (error) {
    console.error("Inbox error:", error);
    return NextResponse.json(
      { error: "Failed to load notifications" },
      { status: 500 },
    );
  }
}

// PATCH mark one (or all) notifications as read
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await request.json().catch(() => null)) as {
      id?: string;
      all?: boolean;
    } | null;
    if (body?.all) {
      await prisma.notification.updateMany({
        where: { userId: session.user.id, read: false },
        data: { read: true },
      });
      return NextResponse.json({ ok: true });
    }
    if (!body?.id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    await prisma.notification.updateMany({
      where: { id: body.id, userId: session.user.id },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Inbox update error:", error);
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 },
    );
  }
}
