import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// DELETE an announcement broadcast + its inbox copies (admin only)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const announcement = await prisma.announcement.findUnique({
      where: { id },
      select: { id: true, title: true, message: true },
    });
    if (!announcement) {
      return NextResponse.json(
        { error: "Announcement not found" },
        { status: 404 },
      );
    }
    // Remove the public broadcast and the matching per-user inbox copies
    // (matched by title + message + type, same payload the send route wrote).
    const [deleted] = await Promise.all([
      prisma.announcement.delete({ where: { id } }),
      prisma.notification.deleteMany({
        where: {
          type: "ANNOUNCEMENT",
          title: announcement.title,
          message: announcement.message,
        },
      }),
    ]);
    return NextResponse.json({ ok: true, id: deleted.id });
  } catch (error) {
    console.error("Delete announcement error:", error);
    return NextResponse.json(
      { error: "Failed to delete announcement" },
      { status: 500 },
    );
  }
}
