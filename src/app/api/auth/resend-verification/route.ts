import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createEmailVerificationToken,
  sendVerificationEmail,
} from "@/lib/email-verification";
import { withRateLimit, authRateLimiters } from "@/lib/rate-limit";
import { getAuthCooldownMs } from "@/lib/config";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const email =
      request.nextUrl.searchParams.get("email")?.trim().toLowerCase() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        emailVerified: true,
        resendNextAllowedAt: true,
      },
    });

    // Don't reveal if account exists - return generic response
    if (!user || user.emailVerified) {
      return NextResponse.json({ resendNextAllowedAt: null });
    }

    return NextResponse.json({
      resendNextAllowedAt: user.resendNextAllowedAt?.toISOString() ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Could not check resend cooldown", {
      cause: error instanceof Error ? error : undefined,
      metadata: { error: message },
    });
    return NextResponse.json(
      { error: "Could not check cooldown." },
      { status: 503 },
    );
  }
}

export const POST = withRateLimit(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        emailVerified: true,
        emailVerificationTokenHash: true,
        emailVerificationExpiresAt: true,
        resendAttemptCount: true,
        resendNextAllowedAt: true,
        resendLastAttemptAt: true,
      },
    });
    const genericMessage =
      "If an unverified account exists, a verification email has been sent.";

    if (!user || user.emailVerified) {
      const resendNextAllowed = user?.resendNextAllowedAt
        ? user.resendNextAllowedAt.toISOString()
        : null;
      return NextResponse.json({
        message: genericMessage,
        resendNextAllowedAt: resendNextAllowed,
      });
    }

    // Throttle repeated resend requests using exponential backoff. A user may
    // request a fresh link while their previous one is still valid, but the
    // interval between attempts grows with each request.
    // Reset attempt count if 24 hours have passed since last attempt
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const effectiveAttemptCount =
      user?.resendLastAttemptAt && user.resendLastAttemptAt < twentyFourHoursAgo
        ? 0
        : (user?.resendAttemptCount ?? 0);

    const attemptNumber =
      effectiveAttemptCount != null ? effectiveAttemptCount + 1 : 0;
    if (user?.resendNextAllowedAt && user?.resendNextAllowedAt > new Date()) {
      const resendNextAllowed =
        user?.resendNextAllowedAt?.toISOString() ?? null;
      return NextResponse.json({
        message: genericMessage,
        resendNextAllowedAt: resendNextAllowed,
      });
    }

    const cooldownMs = getAuthCooldownMs(attemptNumber);
    const nextAllowedAt = new Date(Date.now() + cooldownMs);

    const verification = createEmailVerificationToken();
    const previousHash = user.emailVerificationTokenHash ?? "";
    const updated = await prisma.user.updateMany({
      where: {
        id: user.id,
        emailVerified: false,
        emailVerificationTokenHash: user.emailVerificationTokenHash,
        emailVerificationExpiresAt: user.emailVerificationExpiresAt,
      },
      data: {
        emailVerificationTokenHash: verification.tokenHash,
        emailVerificationExpiresAt: verification.expiresAt,
        resendAttemptCount: attemptNumber,
        resendNextAllowedAt: nextAllowedAt,
        resendLastAttemptAt: new Date(),
      },
    });

    if (updated.count === 1) {
      try {
        await sendVerificationEmail({
          email: user.email,
          firstName: user.firstName,
          token: verification.token,
        });
      } catch {
        // Restore the previous link when delivery fails so the user is not left
        // with an unsent token. Compare-and-set avoids overwriting a newer resend.
        await prisma.user.updateMany({
          where: {
            id: user.id,
            emailVerificationTokenHash: verification.tokenHash,
          },
          data: {
            emailVerificationTokenHash: previousHash || null,
            emailVerificationExpiresAt: user.emailVerificationExpiresAt,
          },
        });
        throw new Error("Verification email delivery failed");
      }
    }

    const resendNextAllowed = nextAllowedAt.toISOString();
    return NextResponse.json({
      message: genericMessage,
      resendNextAllowedAt: resendNextAllowed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (error instanceof Error && error.message.includes("Brevo HTTP 401")) {
      logger.error(
        "Could not resend verification email: Brevo rejected its API key (HTTP 401). Check BREVO_API_KEY.",
      );
    } else {
      logger.error("Could not resend verification email", {
        cause: error instanceof Error ? error : undefined,
        metadata: { error: message },
      });
    }
    return NextResponse.json(
      { error: "Could not send a verification email. Please try again later." },
      { status: 503 },
    );
  }
}, authRateLimiters.resendVerification);
