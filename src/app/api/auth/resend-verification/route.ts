import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createEmailVerificationToken,
  sendVerificationEmail,
} from "@/lib/email-verification";

// Exponential backoff table for repeated verification-email requests.
// attempt 1 = 10s, 2 = 30s, 3 = 60s, 4 = 2m, 5 = 5m, 6 = 10m, 7 = 20m,
// 8 = 40m, 9 = 1h, 10 = 2h, 11 = 4h, 12 = 8h, 13+ = 12h (capped).
const COOLDOWN_TABLE_MS = [
  10 * 1000,      // 10s  - attempt 1
  30 * 1000,      // 30s  - attempt 2
  60 * 1000,      // 1m   - attempt 3
  2 * 60 * 1000,  // 2m   - attempt 4
  5 * 60 * 1000,  // 5m   - attempt 5
  10 * 60 * 1000, // 10m  - attempt 6
  20 * 60 * 1000, // 20m  - attempt 7
  40 * 60 * 1000, // 40m  - attempt 8
  60 * 60 * 1000, // 1h   - attempt 9
  2 * 60 * 60 * 1000, // 2h - attempt 10
  4 * 60 * 60 * 1000, // 4h - attempt 11
  8 * 60 * 60 * 1000, // 8h - attempt 12
  12 * 60 * 60 * 1000, // 12h - attempt 13
];

function getCooldownMs(attemptNumber: number): number {
  const index = Math.min(Math.max(attemptNumber - 1, 0), COOLDOWN_TABLE_MS.length - 1);
  return COOLDOWN_TABLE_MS[index];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
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
      },
    });
    const genericMessage = "If an unverified account exists, a verification email has been sent.";

    if (!user || user.emailVerified) {
      const resendNextAllowed = user?.resendNextAllowedAt ? user.resendNextAllowedAt.toISOString() : null;
      return NextResponse.json({ message: genericMessage, resendNextAllowedAt: resendNextAllowed });
    }

    // Throttle repeated resend requests using exponential backoff. A user may
    // request a fresh link while their previous one is still valid, but the
    // interval between attempts grows with each request.
    const attemptNumber = user?.resendAttemptCount != null ? user.resendAttemptCount + 1 : 0;
    if (user?.resendNextAllowedAt && user?.resendNextAllowedAt > new Date()) {
      const resendNextAllowed = user?.resendNextAllowedAt?.toISOString() ?? null;
      return NextResponse.json({ message: genericMessage, resendNextAllowedAt: resendNextAllowed });
    }

    const cooldownMs = getCooldownMs(attemptNumber);
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
      },
    });

    if (updated.count === 1) {
      try {
        await sendVerificationEmail({ email: user.email, firstName: user.firstName, token: verification.token });
      } catch {
        // Restore the previous link when delivery fails so the user is not left
        // with an unsent token. Compare-and-set avoids overwriting a newer resend.
        await prisma.user.updateMany({
          where: { id: user.id, emailVerificationTokenHash: verification.tokenHash },
          data: {
            emailVerificationTokenHash: previousHash || null,
            emailVerificationExpiresAt: user.emailVerificationExpiresAt,
          },
        });
        throw new Error("Verification email delivery failed");
      }
    }

    const resendNextAllowed = nextAllowedAt.toISOString();
    return NextResponse.json({ message: genericMessage, resendNextAllowedAt: resendNextAllowed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (error instanceof Error && error.message.includes("Brevo HTTP 401")) {
      console.error("Could not resend verification email: Brevo rejected its API key (HTTP 401). Check BREVO_API_KEY.");
    } else {
      console.error("Could not resend verification email:", message);
    }
    return NextResponse.json({ error: "Could not send a verification email. Please try again later." }, { status: 503 });
  }
}