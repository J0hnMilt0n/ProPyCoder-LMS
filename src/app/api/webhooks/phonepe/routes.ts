import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPhonePeOrderStatus } from "@/lib/phonepe";
import { completePhonePePaymentFromWebhook } from "@/lib/payment-completion";

function verifyWebhookAuthorization(
  authorization: string | null,
): boolean {
  const username = process.env.PHONEPE_WEBHOOK_USERNAME;
  const password = process.env.PHONEPE_WEBHOOK_PASSWORD;

  if (!username || !password || !authorization) {
    return false;
  }

  const expected = createHash("sha256")
    .update(`${username}:${password}`)
    .digest();

  const suppliedHex = authorization.trim();

  if (!/^[a-fA-F0-9]{64}$/.test(suppliedHex)) {
    return false;
  }

  const supplied = Buffer.from(suppliedHex, "hex");

  return (
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  );
}

export async function POST(request: Request) {
  try {
    // 1. Authenticate PhonePe's callback.
    if (
      !verifyWebhookAuthorization(
        request.headers.get("authorization"),
      )
    ) {
      return Response.json(
        { success: false, message: "Unauthorized webhook" },
        { status: 401 },
      );
    }

    // 2. Parse callback body.
    const body = await request.json();

    const event = body?.event;
    const merchantOrderId = body?.payload?.merchantOrderId;

    if (
      !["checkout.order.completed", "checkout.order.failed"].includes(
        event,
      )
    ) {
      // Ignore unrelated events.
      return Response.json({
        success: true,
        message: "Event ignored",
      });
    }

    if (
      typeof merchantOrderId !== "string" ||
      !merchantOrderId.trim()
    ) {
      return Response.json(
        { success: false, message: "Invalid merchantOrderId" },
        { status: 400 },
      );
    }

    // 3. Find the original payment.
    const payment = await prisma.payment.findUnique({
      where: { id: merchantOrderId },
    });

    if (!payment) {
      return Response.json(
        { success: false, message: "Payment not found" },
        { status: 404 },
      );
    }

    if (payment.paymentMethod !== "PHONEPE") {
      return Response.json(
        { success: false, message: "Invalid payment method" },
        { status: 400 },
      );
    }

    // 4. Duplicate webhook: already completed.
    if (payment.status === "COMPLETED") {
      return Response.json({
        success: true,
        alreadyCompleted: true,
      });
    }

    // Don't modify payments that are no longer pending.
    if (payment.status !== "PENDING") {
      return Response.json({
        success: true,
        message: "Payment is no longer pending",
      });
    }

    // 5. Verify the actual order status directly with PhonePe.
    const provider = await getPhonePeOrderStatus(payment.id);

    // Verify amount in paise.
    const expectedAmount = Math.round(
      Number(payment.amount) * 100,
    );

    if (
      Number(provider.amount) !== expectedAmount
    ) {
      console.error("PhonePe webhook amount mismatch:", {
        paymentId: payment.id,
        expectedAmount,
        receivedAmount: provider.amount,
      });

      return Response.json(
        { success: false, message: "Payment amount mismatch" },
        { status: 400 },
      );
    }

    // 6. Complete payment and create enrollments.
    if (provider.state === "COMPLETED") {
      try {
        await completePhonePePaymentFromWebhook(
          payment.id,
          payment.userId,
          provider,
        );
      } catch (error) {
        // Another request may have completed this payment
        // while this webhook was being processed.
        const latestPayment = await prisma.payment.findUnique({
          where: { id: payment.id },
          select: { status: true },
        });

        if (latestPayment?.status !== "COMPLETED") {
          throw error;
        }
      }

      return Response.json({
        success: true,
        status: "COMPLETED",
      });
    }

    // 7. Mark failed only when PhonePe confirms failure.
    if (provider.state === "FAILED") {
      await prisma.payment.updateMany({
        where: {
          id: payment.id,
          userId: payment.userId,
          paymentMethod: "PHONEPE",
          status: "PENDING",
        },
        data: {
          status: "FAILED",
        },
      });

      return Response.json({
        success: true,
        status: "FAILED",
      });
    }

    // 8. Still pending at PhonePe.
    return Response.json({
      success: true,
      status: "PENDING",
    });
  } catch (error) {
    console.error("PhonePe webhook error:", error);

    // Non-2xx response allows PhonePe to retry delivery.
    return Response.json(
      {
        success: false,
        message: "Webhook processing failed",
      },
      { status: 500 },
    );
  }
}