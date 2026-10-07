import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const target = new URL("/pycoder", request.url);
  target.searchParams.set("path", slug.join("/"));
  return NextResponse.redirect(target);
}
