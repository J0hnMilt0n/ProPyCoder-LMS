import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash, randomBytes } from "node:crypto";

// Exponential backoff table (same as resend-verification)
const COOLDOWN_TABLE_MS = [
  10 * 1000, 30 * 1000, 60 * 1000, 2 * 60 * 1000, 5 * 60 * 1000,
  10 * 60 * 1000, 20 * 60 * 1000, 40 * 60 * 1000, 60 * 60 * 1000,
  2 * 60 * 60 * 1000, 4 * 60 * 60 * 1000, 8 * 60 * 60 * 1000, 12 * 60 * 60 * 1000,
];

function getCooldownMs(attemptNumber: number): number {
  const index = Math.min(Math.max(attemptNumber - 1, 0), COOLDOWN_TABLE_MS.length - 1);
  return COOLDOWN_TABLE_MS[index];
}

const TOKEN_TTL_MS = 30 * 60 * 1000;

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
        passwordResetAttemptCount: true,
        passwordResetNextAllowedAt: true,
      },
    });

    const genericMessage = "If an account exists with that email, a password reset link has been sent.";

    // Don't reveal if account exists
    if (!user) {
      return NextResponse.json({ message: genericMessage, resendNextAllowedAt: null });
    }

    const attemptNumber = user.passwordResetAttemptCount != null ? user.passwordResetAttemptCount + 1 : 0;

    // Check cooldown
    if (user.passwordResetNextAllowedAt && user.passwordResetNextAllowedAt > new Date()) {
      return NextResponse.json({
        message: genericMessage,
        resendNextAllowedAt: user.passwordResetNextAllowedAt.toISOString(),
      });
    }

    const cooldownMs = getCooldownMs(attemptNumber);
    const nextAllowedAt = new Date(Date.now() + cooldownMs);

    // Generate reset token
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    // Update user
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: expiresAt,
        passwordResetAttemptCount: attemptNumber,
        passwordResetNextAllowedAt: nextAllowedAt,
      },
    });

// Send email with Brevo
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME?.trim() || "ProPyCoder";
    const baseUrl = process.env.NEXTAUTH_URL;

    if (apiKey && senderEmail && baseUrl) {
      const origin = new URL(baseUrl);
      const resetUrl = new URL("/auth/reset-password", origin);
      resetUrl.searchParams.set("token", token);
      const logoUrl = new URL("/propycoder-logo.png", origin).toString();
      const safeName = user.firstName.replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
      const safeUrl = resetUrl.toString().replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
      const safeLogoUrl = logoUrl.replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));

      const textContent = [
        `Hi ${user.firstName},`,
        "",
        "We received a request to reset your ProPyCoder password.",
        "",
        "Click the link below to choose a new password:",
        resetUrl.toString(),
        "",
        "This secure link expires in 30 minutes and can only be used once.",
        "If you did not request a password reset, you can safely ignore this email.",
        "",
        "Practical skills. Real projects. Your next chapter.",
        "Need help? support@propycoder.com",
        "© ProPyCoder · This is an account-related message.",
      ].join("\n");

      const htmlContent = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Reset your password | ProPyCoder</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f3f1;font-family:Arial,Helvetica,sans-serif;color:#252525;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f3f1" style="background-color:#f4f3f1;">
    <tr><td align="center" style="padding:38px 14px 30px;">
      <table role="presentation" width="520" cellspacing="0" cellpadding="0" border="0" style="width:520px;max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
        <tr><td style="padding:32px 36px 24px;text-align:center;border-bottom:1px solid #f0eee9;">
          <img src="${safeLogoUrl}" alt="ProPyCoder" width="140" style="display:block;margin:0 auto 12px;height:auto;" />
          <p style="margin:0;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#8a8a8a;">Password Reset</p>
        </td></tr>
        <tr><td class="email-card-content" style="padding:34px 40px 30px;">
          <h1 class="email-heading" style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#1a1a1a;font-weight:700;">Reset your password</h1>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#4a4a4a;">Hi ${safeName},</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4a4a4a;">We received a request to reset your ProPyCoder password. Click the button below to choose a new password.</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
            <tr><td align="center" style="border-radius:8px;background:#e95f32;">
              <a href="${safeUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Reset password</a>
            </td></tr>
          </table>
          <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#6a6a6a;">Or copy and paste this link into your browser:</p>
          <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${safeUrl}" style="color:#e95f32;text-decoration:underline;">${safeUrl}</a></p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6a6a6a;">This secure link expires in 30 minutes and can only be used once.</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#6a6a6a;">If you did not request a password reset, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="padding:18px 40px 26px;border-top:1px solid #f0eee9;text-align:center;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#8a8a8a;">Practical skills. Real projects. Your next chapter.</p>
          <p style="margin:6px 0 0;font-size:11px;color:#a0a0a0;">Need help? <a href="mailto:support@propycoder.com" style="color:#a94325;text-decoration:underline;">support@propycoder.com</a></p>
        </td></tr>
      </table>
      <table role="presentation" width="520" cellspacing="0" cellpadding="0" border="0" style="width:520px;max-width:520px;margin-top:14px;">
        <tr><td align="center" style="padding:12px 18px 0;color:#888888;font-size:10px;line-height:1.55;">© ProPyCoder · This is an account-related message.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: user.email, name: user.firstName }],
          subject: "Reset your ProPyCoder password",
          textContent,
          htmlContent,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    }

    return NextResponse.json({
      message: genericMessage,
      resendNextAllowedAt: nextAllowedAt.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Could not send password reset email:", message);
    return NextResponse.json({ error: "Could not send reset email. Please try again later." }, { status: 503 });
  }
}