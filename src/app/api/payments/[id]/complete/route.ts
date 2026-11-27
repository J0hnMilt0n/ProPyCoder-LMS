import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/route";
import { effectiveCoursePrice } from "@/lib/pricing";
import { getPhonePeOrderStatus } from "@/lib/phonepe";
import { completePhonePePayment } from "@/lib/payment-completion";
import { logger } from "@/lib/logger";

interface Props {
  params: Promise<{ id: string }>;
}

// Use the PhonePe merchant reference for provider API calls.
// Keep the internal Prisma ID for all database operations.
function getProviderOrderId(payment: {
  id: string;
  merchantOrderId: string | null;
}) {
  return payment.merchantOrderId ?? payment.id;
}

function verifyProviderAmount(
  providerAmount: number | undefined,
  paymentAmount: number,
) {
  const expectedAmount = Math.round(paymentAmount * 100);
  const actualAmount = Number(providerAmount);

  return Number.isSafeInteger(actualAmount) && actualAmount === expectedAmount;
}

// GET payment status
export async function GET(request: NextRequest, { params }: Props) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
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
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (payment.status === "PENDING" && payment.paymentMethod === "PHONEPE") {
      const providerOrderId = getProviderOrderId(payment);
      const provider = await getPhonePeOrderStatus(providerOrderId);
      const providerState = provider.state?.toUpperCase();

      if (provider.orderId && provider.orderId !== providerOrderId) {
        logger.error("[Payments] PhonePe order ID mismatch", {
          metadata: {
            paymentId: payment.id,
            expectedOrderId: providerOrderId,
            providerOrderId: provider.orderId,
          },
        });

        return NextResponse.json(
          { error: "Payment order verification failed" },
          { status: 502 },
        );
      }

      if (providerState === "COMPLETED") {
        if (!verifyProviderAmount(provider.amount, payment.amount)) {
          logger.error("[Payments] Amount verification failed", {
            metadata: {
              paymentId: payment.id,
              providerAmount: provider.amount,
              expectedAmount: Math.round(payment.amount * 100),
            },
          });

          return NextResponse.json(
            { error: "Payment amount verification failed" },
            { status: 502 },
          );
        }

        await completePhonePePayment(payment.id, session.user.id, provider);

        const refreshed = await prisma.payment.findUnique({
          where: { id },
          include: {
            course: true,
            bundle: {
              include: { courses: { include: { course: true } } },
            },
            enrollment: true,
          },
        });

        if (refreshed) {
          if (refreshed.bundle) {
            const ownedCourses = await prisma.enrollment.findMany({
              where: {
                studentId: session.user.id,
                courseId: {
                  in: refreshed.bundle.courses.map(({ courseId }) => courseId),
                },
              },
              select: { courseId: true },
            });

            const ownedIds = new Set(
              ownedCourses.map(({ courseId }) => courseId),
            );

            const purchaseCredit = Math.min(
              refreshed.bundle.price,
              refreshed.bundle.courses.reduce(
                (total, { course }) =>
                  total +
                  (ownedIds.has(course.id) ? effectiveCoursePrice(course) : 0),
                0,
              ),
            );

            return NextResponse.json({
              ...refreshed,
              pricingBreakdown: {
                originalBundlePrice: refreshed.bundle.price,
                purchaseCredit,
                amountDue: refreshed.amount,
              },
              purchasedCourseIds: [...ownedIds],
            });
          }

          return NextResponse.json(refreshed);
        }
      } else if (providerState === "FAILED" || providerState === "EXPIRED") {
        await prisma.payment.updateMany({
          where: {
            id: payment.id,
            status: "PENDING",
          },
          data: { status: "FAILED" },
        });

        payment.status = "FAILED";
      }
    }

    if (payment.bundle) {
      const ownedCourses = await prisma.enrollment.findMany({
        where: {
          studentId: session.user.id,
          courseId: {
            in: payment.bundle.courses.map(({ courseId }) => courseId),
          },
        },
        select: { courseId: true },
      });

      const ownedIds = new Set(ownedCourses.map(({ courseId }) => courseId));

      const purchaseCredit = Math.min(
        payment.bundle.price,
        payment.bundle.courses.reduce(
          (total, { course }) =>
            total +
            (ownedIds.has(course.id) ? effectiveCoursePrice(course) : 0),
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
    logger.error("Payment fetch error", {
      cause: error instanceof Error ? error : undefined,
      metadata: { error: String(error) },
    });

    return NextResponse.json(
      { error: "Failed to fetch payment" },
      { status: 500 },
    );
  }
}

// POST verifies PhonePe with the provider before granting enrollment.
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
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
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (payment.status === "COMPLETED") {
      return NextResponse.json({
        success: true,
        alreadyCompleted: true,
      });
    }

    if (payment.status !== "PENDING") {
      return NextResponse.json(
        { error: "Payment already processed" },
        { status: 400 },
      );
    }

    if (payment.paymentMethod !== "PHONEPE") {
      return NextResponse.json(
        { error: "Payment provider is not configured" },
        { status: 409 },
      );
    }

    // IMPORTANT: Use merchantOrderId, not the internal Prisma payment ID.
    const providerOrderId = getProviderOrderId(payment);
    const provider = await getPhonePeOrderStatus(providerOrderId);
    const providerState = provider.state?.toUpperCase();

    if (provider.orderId && provider.orderId !== providerOrderId) {
      logger.error("[Payments] PhonePe order ID mismatch", {
        metadata: {
          paymentId: payment.id,
          expectedOrderId: providerOrderId,
          providerOrderId: provider.orderId,
        },
      });

      return NextResponse.json(
        { error: "Payment order verification failed" },
        { status: 502 },
      );
    }

    if (providerState === "FAILED" || providerState === "EXPIRED") {
      await prisma.payment.updateMany({
        where: {
          id: payment.id,
          status: "PENDING",
        },
        data: { status: "FAILED" },
      });

      return NextResponse.json(
        { error: "PhonePe payment failed or expired" },
        { status: 409 },
      );
    }

    if (providerState !== "COMPLETED") {
      logger.warn("[Payments] Payment not completed", {
        metadata: {
          paymentId: payment.id,
          merchantOrderId: providerOrderId,
          providerState,
        },
      });

      return NextResponse.json(
        { error: "PhonePe has not confirmed this payment" },
        { status: 409 },
      );
    }

    if (!verifyProviderAmount(provider.amount, payment.amount)) {
      logger.error("[Payments] Amount verification failed", {
        metadata: {
          paymentId: payment.id,
          providerAmount: provider.amount,
          expectedAmount: Math.round(payment.amount * 100),
        },
      });

      return NextResponse.json(
        { error: "Payment amount verification failed" },
        { status: 409 },
      );
    }

    // Use internal Prisma ID for payment completion.
    return NextResponse.json(
      await completePhonePePayment(payment.id, session.user.id, provider),
    );
  } catch (error) {
    logger.error("Payment verification error", {
      cause: error instanceof Error ? error : undefined,
      metadata: { error: String(error) },
    });

    return NextResponse.json(
      { error: "Failed to verify payment" },
      { status: 502 },
    );
  }
}
