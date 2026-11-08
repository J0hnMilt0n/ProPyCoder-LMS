import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { role: true, avatar: true },
  });

  if (!user?.avatar) {
    return new NextResponse("Not found", { status: 404 });
  }

  const isPublicInstructor = user.role === "INSTRUCTOR";
  if (!isPublicInstructor) {
    const session = await auth();
    if (
      !session?.user?.id ||
      (session.user.role !== "ADMIN" && session.user.id !== id)
    ) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  if (user.avatar.startsWith("http://") || user.avatar.startsWith("https://")) {
    return NextResponse.redirect(user.avatar, {
      status: 302,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  }

  const match = user.avatar.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) {
    return new NextResponse("Invalid image format", { status: 400 });
  }

  const headers = new Headers({
    "Content-Type": match[1],
    "Cache-Control": isPublicInstructor
      ? "public, max-age=31536000, s-maxage=31536000, immutable"
      : "private, max-age=31536000, immutable",
  });
  if (!isPublicInstructor) headers.set("Vary", "Cookie");

  return new NextResponse(Buffer.from(match[2], "base64"), { headers });
}
