import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/**
 * Serve a versioned course thumbnail with long-lived browser/edge caching.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const course = await prisma.course.findUnique({
    where: { id },
    select: { image: true },
  });

  if (!course?.image) {
    return new NextResponse("Not found", { status: 404 });
  }

  const image = course.image;

  // External URLs — redirect so the origin controls caching.
  if (image.startsWith("http://") || image.startsWith("https://")) {
    return NextResponse.redirect(image, 302);
  }

  // Data URLs — parse and serve with immutable cache headers.
  if (image.startsWith("data:")) {
    const match = image.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) {
      return new NextResponse("Invalid image format", { status: 400 });
    }
    const contentType = match[1];
    const buffer = Buffer.from(match[2], "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control":
          "public, max-age=31536000, s-maxage=31536000, immutable",
      },
    });
  }

  return new NextResponse("Unsupported image format", { status: 400 });
}
