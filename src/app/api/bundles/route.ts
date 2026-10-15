import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getBundles } from "@/lib/page-cache";

// GET published bundles — public, no auth required.
export async function GET() {
  try {
    // Public and identical for every visitor — cache it globally. Bundle
    // writes call invalidateBundles() so the storefront refreshes on change.
    const { bundles } = await getBundles(async () => ({
      bundles: await prisma.bundle.findMany({
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
    }));
    return NextResponse.json({ bundles });
  } catch (error) {
    console.error("Public bundles error:", error);
    return NextResponse.json(
      { error: "Failed to load bundles" },
      { status: 500 },
    );
  }
}
