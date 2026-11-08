import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getBundles } from "@/lib/page-cache";
import { imageUrl } from "@/lib/image-urls";

export const revalidate = 2592000;

// GET published bundles — public, no auth required.
export async function GET() {
  try {
    const { bundles } = await getBundles(async () => ({
      bundles: (
        await prisma.bundle.findMany({
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
        })
      ).map((bundle) => ({
        ...bundle,
        image: imageUrl(bundle.image, "bundle", bundle.id),
        courses: bundle.courses.map((entry) => ({
          ...entry,
          course: {
            ...entry.course,
            image: imageUrl(entry.course.image, "course", entry.course.id),
          },
        })),
      })),
    }));
    return NextResponse.json(
      { bundles },
      {
        headers: {
          "Cache-Control":
            "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=60",
        },
      },
    );
  } catch (error) {
    console.error("Public bundles error:", error);
    return NextResponse.json(
      { error: "Failed to load bundles" },
      { status: 500 },
    );
  }
}
