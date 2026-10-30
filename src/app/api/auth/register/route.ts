import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { issueVerificationEmail } from "@/lib/email-verification";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";

    if (!email || !password || !firstName || !lastName ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 || firstName.length > 80 || lastName.length > 80 ||
      password.length < 6 || password.length > 128) {
      return NextResponse.json(
        { error: "Enter valid account details. Password must be 6–128 characters." },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role: "STUDENT",
        emailVerified: false,
      },
      select: { id: true, email: true, firstName: true },
    });

    try {
      await issueVerificationEmail(user);
    } catch (error) {
      // issueVerificationEmail owns cleanup if delivery fails. Do not delete
      // the same user here again: its rollback may already have removed it.
      console.error(
        "Registration verification email could not be sent:",
        error instanceof Error ? error.message : "Unknown email delivery error",
      );
      return NextResponse.json(
        { error: "We could not send the verification email. Please try registering again later." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        message: "Account created. Check your inbox for a verification link.",
        email: user.email,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
