
import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPhonePeOrderStatus } from "@/lib/phonepe";
import { completePhonePePaymentFromWebhook } from "@/lib/payment-completion";
import { logger } from "@/lib/logger";

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
      ![
        "checkout.order.completed",
        "checkout.order.failed",
      ].includes(event)
    ) {
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

    // 3. Find payment using PhonePe merchantOrderId.
    const payment = await prisma.payment.findUnique({
      where: { merchantOrderId },
    });

    if (!payment) {
      logger.warn("[PhonePe Webhook] Payment not found", {
        metadata: { merchantOrderId },
      });

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

    // 4. Duplicate webhook protection.
    if (payment.status === "COMPLETED") {
      return Response.json({
        success: true,
        alreadyCompleted: true,
      });
    }

    if (payment.status !== "PENDING") {
      return Response.json({
        success: true,
        message: "Payment is no longer pending",
      });
    }

    // 5. Verify actual status directly with PhonePe.
    // IMPORTANT: Use merchantOrderId, NOT payment.id.
    const provider = await getPhonePeOrderStatus(merchantOrderId);

    const providerState = provider.state?.toUpperCase();

    // Verify returned order ID when supplied.
    if (
      provider.orderId &&
      provider.orderId !== merchantOrderId
    ) {
      logger.error("[PhonePe Webhook] Order ID mismatch", {
        metadata: {
          paymentId: payment.id,
          merchantOrderId,
          providerOrderId: provider.orderId,
        },
      });

      return Response.json(
        { success: false, message: "Order ID verification failed" },
        { status: 400 },
      );
    }

    // 6. Verify amount only when PhonePe confirms completion.
    if (providerState === "COMPLETED") {
      const expectedAmount = Math.round(
        Number(payment.amount) * 100,
      );

      const providerAmount = Number(provider.amount);

      if (
        !Number.isSafeInteger(providerAmount) ||
        providerAmount !== expectedAmount
      ) {
        logger.error("[PhonePe Webhook] Amount mismatch", {
          metadata: {
            paymentId: payment.id,
            merchantOrderId,
            expectedAmount,
            providerAmount,
          },
        });

        return Response.json(
          { success: false, message: "Payment amount mismatch" },
          { status: 400 },
        );
      }

      // 7. Complete payment and create enrollments.
      try {
        await completePhonePePaymentFromWebhook(
          payment.id,
          payment.userId,
          provider,
        );
      } catch (error) {
        // Another request may have completed this payment.
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

    // 8. Mark failed only when PhonePe confirms failure.
    if (
      providerState === "FAILED" ||
      providerState === "EXPIRED"
    ) {
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

    // 9. Still pending at PhonePe.
    return Response.json({
      success: true,
      status: "PENDING",
    });
  } catch (error) {
    logger.error("[PhonePe Webhook] Processing error", {
      cause: error instanceof Error ? error : undefined,
      metadata: { error: String(error) },
    });

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
