import { auth } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bundleUpdate = z.object({
  title: z.string().trim().min(4).max(120).optional(),
  description: z.string().trim().min(20).max(5000).optional(),
  image: z.union([z.string().url(), z.literal("")]).optional(),
  price: z.number().finite().min(0).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  courseIds: z.array(z.string().trim().min(1)).min(2).max(20).optional(),
});

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return null;
  return session;
}

// PUT update a bundle (admin only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const parsed = bundleUpdate.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check the bundle fields and try again" },
        { status: 400 },
      );
    }
    const existing = await prisma.bundle.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Bundle not found" },
        { status: 404 },
      );
    }

    const { courseIds, ...fields } = parsed.data;
    if (courseIds) {
      const uniqueIds = [...new Set(courseIds)];
      if (uniqueIds.length < 2) {
        return NextResponse.json(
          { error: "A bundle needs at least 2 different courses" },
          { status: 400 },
        );
      }
      const courses = await prisma.course.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true },
      });
      if (courses.length !== uniqueIds.length) {
        return NextResponse.json(
          { error: "One or more selected courses were not found" },
          { status: 400 },
        );
      }
      await prisma.$transaction([
        prisma.bundleCourse.deleteMany({ where: { bundleId: id } }),
        prisma.bundleCourse.createMany({
          data: uniqueIds.map((courseId, index) => ({
            bundleId: id,
            courseId,
            order: index + 1,
          })),
        }),
      ]);
    }

    const bundle = await prisma.bundle.update({
      where: { id },
      data: {
        ...(fields.title ? { title: fields.title } : {}),
        ...(fields.description ? { description: fields.description } : {}),
        ...(fields.image !== undefined
          ? { image: fields.image || null }
          : {}),
        ...(fields.price !== undefined ? { price: fields.price } : {}),
        ...(fields.status ? { status: fields.status } : {}),
      },
      include: {
        courses: {
          include: {
            course: {
              select: {
                id: true,
                title: true,
                price: true,
                offerPrice: true,
                image: true,
                status: true,
              },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    });
    return NextResponse.json({ bundle });
  } catch (error) {
    console.error("Update bundle error:", error);
    return NextResponse.json(
      { error: "Failed to update bundle" },
      { status: 500 },
    );
  }
}

// DELETE a bundle — courses and past enrollments stay intact (admin only)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const existing = await prisma.bundle.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Bundle not found" },
        { status: 404 },
      );
    }
    await prisma.bundle.delete({ where: { id } });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("Delete bundle error:", error);
    return NextResponse.json(
      { error: "Failed to delete bundle" },
      { status: 500 },
    );
  }
}
