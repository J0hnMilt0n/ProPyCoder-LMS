import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/route";

interface Props {
  params: Promise<{ id: string }>;
}

// GET payment status
export async function GET(request: NextRequest, { params }: Props) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        course: true,
        bundle: {
          include: { courses: { include: { course: true } } },
        },
        enrollment: true,
      },
    });

    if (!payment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    if (payment.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error("Payment fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch payment" },
      { status: 500 }
    );
  }
}

// POST complete payment (simulate payment success)
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { transactionId, paymentMethod } = body;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        course: true,
        bundle: { include: { courses: true } },
      },
    });

    if (!payment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    if (payment.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    if (payment.status !== "PENDING") {
      return NextResponse.json(
        { error: "Payment already processed" },
        { status: 400 }
      );
    }

    // In production, verify payment with Stripe/PayPal using transactionId
    // For demo purposes, we'll mark it as completed

    // Start a transaction to create enrollment(s) and update payment
    const result = await prisma.$transaction(async (tx) => {
      // Update payment status
      const updatedPayment = await tx.payment.update({
        where: { id },
        data: {
          status: "COMPLETED",
          transactionId: transactionId || `TXN_${Date.now()}`,
          // Record how the buyer paid (CARD / UPI / NETBANKING from checkout).
          paymentMethod:
            typeof paymentMethod === "string" && paymentMethod.trim()
              ? paymentMethod.trim()
              : payment.paymentMethod ?? "CARD",
        },
      });

      let enrollments: { id: string; courseId: string }[] = [];

      if (payment.bundleId && payment.bundle) {
        // Bundle purchase → enroll in every course the buyer doesn't own yet.
        const courseIds = payment.bundle.courses.map((c) => c.courseId);
        await tx.enrollment.createMany({
          data: courseIds.map((courseId) => ({
            studentId: session.user!.id,
            courseId,
            status: "ACTIVE",
          })),
          skipDuplicates: true,
        });
        enrollments = await tx.enrollment.findMany({
          where: {
            studentId: session.user!.id,
            courseId: { in: courseIds },
          },
          select: { id: true, courseId: true },
        });
      } else if (payment.courseId) {
        const enrollment = await tx.enrollment.create({
          data: {
            studentId: session.user!.id,
            courseId: payment.courseId,
            status: "ACTIVE",
          },
          select: { id: true, courseId: true },
        });
        enrollments = [enrollment];
      } else {
        throw new Error("Payment has neither course nor bundle");
      }

      // Link payment to the first enrollment (back-compat for single-course)
      await tx.payment.update({
        where: { id },
        data: {
          enrollmentId: enrollments[0]?.id ?? null,
        },
      });

      return { payment: updatedPayment, enrollments };
    });

    const message = payment.bundleId
      ? "Payment successful! Your courses are unlocked."
      : "Payment successful! You are now enrolled in the course.";

    return NextResponse.json({
      success: true,
      payment: result.payment,
      enrollments: result.enrollments,
      enrollment: result.enrollments[0] ?? null,
      message,
    });
  } catch (error) {
    console.error("Payment completion error:", error);
    return NextResponse.json(
      { error: "Failed to complete payment" },
      { status: 500 }
    );
  }
}