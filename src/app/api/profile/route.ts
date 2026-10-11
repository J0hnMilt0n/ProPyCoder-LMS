import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/route";
import bcrypt from "bcryptjs";
import { z } from "zod";

const updateSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  // Data URL (uploaded image) or remote URL; empty string or null clears it.
  avatar: z
    .union([z.string().trim().max(2_000_000), z.null()])
    .optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "Use at least 8 characters").optional(),
});

// GET the current user's profile details.
export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Profile fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load profile" },
      { status: 500 },
    );
  }
}

// PATCH update profile details, avatar, and/or password.
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? "Invalid profile update";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { firstName, lastName, avatar, currentPassword, newPassword } =
      parsed.data;

    // Nothing to do?
    if (
      firstName === undefined &&
      lastName === undefined &&
      avatar === undefined &&
      newPassword === undefined
    ) {
      return NextResponse.json(
        { error: "No changes provided" },
        { status: 400 },
      );
    }

    // Verify the current password before allowing a change.
    if (newPassword) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { password: true },
      });
      const valid = user
        ? await bcrypt.compare(currentPassword ?? "", user.password)
        : false;
      if (!valid) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 },
        );
      }
    }

    const data: {
      firstName?: string;
      lastName?: string;
      avatar?: string | null;
      password?: string;
    } = {};
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (avatar !== undefined) data.avatar = avatar || null;
    if (newPassword) data.password = await bcrypt.hash(newPassword, 10);

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 },
    );
  }
}
