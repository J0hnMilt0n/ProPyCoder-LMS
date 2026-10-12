import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET one published bundle with its courses — public, no auth required.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const bundle = await prisma.bundle.findFirst({
      where: { id, status: "PUBLISHED" },
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
                description: true,
                price: true,
                offerPrice: true,
                image: true,
                category: true,
                level: true,
                duration: true,
                instructor: {
                  select: { firstName: true, lastName: true, avatar: true },
                },
              },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    });
    if (!bundle) {
      return NextResponse.json(
        { error: "Bundle not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ bundle });
  } catch (error) {
    console.error("Public bundle error:", error);
    return NextResponse.json(
      { error: "Failed to load bundle" },
      { status: 500 },
    );
  }
}
