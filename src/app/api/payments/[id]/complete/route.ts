import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/route";
import { effectiveCoursePrice } from "@/lib/pricing";
import { getPhonePeOrderStatus } from "@/lib/phonepe";
import { completePhonePePayment } from "@/lib/payment-completion";

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

    if (payment.status === "PENDING" && payment.paymentMethod === "PHONEPE") {
      const provider = await getPhonePeOrderStatus(payment.id);
      const amountInPaise = Math.round(payment.amount * 100);
      if (provider.amount !== amountInPaise) {
        return NextResponse.json({ error: "Payment amount verification failed" }, { status: 502 });
      }
      if (provider.state === "COMPLETED") {
        await completePhonePePayment(payment.id, session.user.id, provider);
        const refreshed = await prisma.payment.findUnique({
          where: { id },
          include: { course: true, bundle: { include: { courses: { include: { course: true } } } }, enrollment: true },
        });
        if (refreshed) return NextResponse.json(refreshed);
      } else if (provider.state === "FAILED") {
        await prisma.payment.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED" } });
        payment.status = "FAILED";
      }
    }

    if (payment.bundle) {
      const ownedCourses = await prisma.enrollment.findMany({
        where: {
          studentId: session.user.id,
          courseId: { in: payment.bundle.courses.map(({ courseId }) => courseId) },
        },
        select: { courseId: true },
      });
      const ownedIds = new Set(ownedCourses.map(({ courseId }) => courseId));
      const purchaseCredit = Math.min(
        payment.bundle.price,
        payment.bundle.courses.reduce(
          (total, { course }) =>
            total + (ownedIds.has(course.id) ? effectiveCoursePrice(course) : 0),
          0,
        ),
      );

      return NextResponse.json({
        ...payment,
        pricingBreakdown: {
          originalBundlePrice: payment.bundle.price,
          purchaseCredit,
          amountDue: payment.amount,
        },
        purchasedCourseIds: [...ownedIds],
      });
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

// POST verifies PhonePe with the provider before granting enrollment.
export async function POST(request: NextRequest, { params }: Props) {
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

    if (payment.status === "COMPLETED") {
      return NextResponse.json({ success: true, alreadyCompleted: true });
    }
    if (payment.status !== "PENDING") {
      return NextResponse.json(
        { error: "Payment already processed" },
        { status: 400 }
      );
    }

    if (payment.paymentMethod !== "PHONEPE") {
      return NextResponse.json({ error: "Payment provider is not configured" }, { status: 409 });
    }
    const provider = await getPhonePeOrderStatus(payment.id);
    if (provider.amount !== Math.round(payment.amount * 100)) {
      return NextResponse.json({ error: "Payment amount verification failed" }, { status: 409 });
    }
    if (provider.state !== "COMPLETED") {
      if (provider.state === "FAILED") {
        await prisma.payment.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED" } });
      }
      return NextResponse.json({ error: "PhonePe has not confirmed this payment" }, { status: 409 });
    }

    return NextResponse.json(await completePhonePePayment(id, session.user.id, provider));
  } catch (error) {
    console.error("Payment verification error:", error);
    return NextResponse.json({ error: "Failed to verify payment" }, { status: 502 });
  }
}