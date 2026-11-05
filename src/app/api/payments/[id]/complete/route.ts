import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/route";
import { effectiveCoursePrice } from "@/lib/pricing";
import { getPaytmOrderStatus } from "@/lib/paytm";
import { completePaytmPayment } from "@/lib/payment-completion";

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

    if (payment.status === "PENDING" && payment.paymentMethod === "PAYTM") {
      const provider = await getPaytmOrderStatus(payment.id);
      const amountInRupees = Number(provider.txnAmount) || 0;
      if (Math.round(amountInRupees * 100) !== Math.round(payment.amount * 100)) {
        return NextResponse.json({ error: "Payment amount verification failed" }, { status: 502 });
      }
      if (provider.status === "TXN_SUCCESS") {
        await completePaytmPayment(payment.id, session.user.id, provider);
        const refreshed = await prisma.payment.findUnique({
          where: { id },
          include: { course: true, bundle: { include: { courses: { include: { course: true } } } }, enrollment: true },
        });
        if (refreshed) return NextResponse.json(refreshed);
      } else if (provider.status === "TXN_FAILURE") {
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

// POST verifies Paytm with the provider before granting enrollment.
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

    if (payment.paymentMethod !== "PAYTM") {
      return NextResponse.json({ error: "Payment provider is not configured" }, { status: 409 });
    }
    const provider = await getPaytmOrderStatus(payment.id);
    const amountInRupees = Number(provider.txnAmount) || 0;
    if (Math.round(amountInRupees * 100) !== Math.round(payment.amount * 100)) {
      return NextResponse.json({ error: "Payment amount verification failed" }, { status: 409 });
    }
    if (provider.status !== "TXN_SUCCESS") {
      if (provider.status === "TXN_FAILURE") {
        await prisma.payment.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED" } });
      }
      return NextResponse.json({ error: "Paytm has not confirmed this payment" }, { status: 409 });
    }

    return NextResponse.json(await completePaytmPayment(id, session.user.id, provider));
  } catch (error) {
    console.error("Payment verification error:", error);
    return NextResponse.json({ error: "Failed to verify payment" }, { status: 502 });
  }
}