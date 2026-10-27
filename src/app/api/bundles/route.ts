import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { cached } from "@/lib/data-cache";
import { GLOBAL_CACHE } from "@/lib/page-cache";

// GET published bundles — public, no auth required.
export async function GET() {
  try {
    // Bundle images can exceed Next.js's 2 MB persistent Data Cache limit.
    // Keep the full response in the existing per-process SWR cache instead.
    const bundles = await cached(
      "bundles:list:",
      () => prisma.bundle.findMany({
        where: { status: "PUBLISHED" },
        select: {
          id: true,
          title: true,
          description: true,
          image: true,
          price: true,
          courses: {
            select: {
              order: true,
              course: {
                select: {
                  id: true,
                  title: true,
                  price: true,
                  offerPrice: true,
                  image: true,
                },
              },
            },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      GLOBAL_CACHE,
    );
    return NextResponse.json({ bundles });
  } catch (error) {
    console.error("Public bundles error:", error);
    return NextResponse.json(
      { error: "Failed to load bundles" },
      { status: 500 },
    );
  }
}
