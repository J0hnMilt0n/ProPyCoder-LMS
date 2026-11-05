import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/**
 * Serve a bundle thumbnail image with immutable cache headers.
 * Bundle thumbnails never change once set, so browsers/CDN can cache forever.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const bundle = await prisma.bundle.findUnique({
    where: { id },
    select: { image: true },
  });

  if (!bundle?.image) {
    return new NextResponse("Not found", { status: 404 });
  }

  const image = bundle.image;

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
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  return new NextResponse("Unsupported image format", { status: 400 });
}
