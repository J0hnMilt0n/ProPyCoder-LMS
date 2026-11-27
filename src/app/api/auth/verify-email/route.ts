import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/email-verification";
import { withRateLimit, authRateLimiters } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const POST = withRateLimit(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const token = typeof body.token === "string" ? body.token : "";
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
      return NextResponse.json(
        { error: "This verification link is invalid or expired." },
        { status: 400 },
      );
    }

    const verified = await verifyEmailToken(token);
    if (!verified) {
      return NextResponse.json(
        { error: "This verification link is invalid or expired." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      message: "Email verified. You can now sign in.",
    });
  } catch (error) {
    logger.error("Email verification failed", {
      cause: error instanceof Error ? error : undefined,
      metadata: { error: String(error) },
    });
    return NextResponse.json(
      { error: "Could not verify email. Please try again." },
      { status: 500 },
    );
  }
}, authRateLimiters.general);
