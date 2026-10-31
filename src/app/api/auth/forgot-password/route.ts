import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash, randomBytes } from "node:crypto";

// Exponential backoff table (same as resend-verification)
const COOLDOWN_TABLE_MS = [
  30 * 1000,                    // 30s  - attempt 2
  5 * 60 * 1000,                // 5m   - attempt 4
  30 * 60 * 1000,               // 30m  - attempt 6
  2 * 60 * 60 * 1000,           // 2h   - attempt 7
  4 * 60 * 60 * 1000,           // 4h   - attempt 8
  6 * 60 * 60 * 1000,           // 6h   - attempt 9
  12 * 60 * 60 * 1000,          // 10h - attempt 10
];

function getCooldownMs(attemptNumber: number): number {
  const index = Math.min(Math.max(attemptNumber - 1, 0), COOLDOWN_TABLE_MS.length - 1);
  return COOLDOWN_TABLE_MS[index];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] || character;
  });
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
      const safeName = escapeHtml(user.firstName);
      const safeUrl = escapeHtml(resetUrl.toString());
      const safeLogoUrl = escapeHtml(logoUrl);

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
  <style>
    @media only screen and (max-width:480px) {
      .email-card-content { padding:28px 22px 26px !important; }
      .email-heading { font-size:25px !important; }
    }
  </style>
  <title>Reset your password | ProPyCoder</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f3f1;font-family:Arial,Helvetica,sans-serif;color:#252525;-webkit-text-size-adjust:100%;">
  <div style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">Reset your ProPyCoder password. Your secure link is ready inside.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f3f1" style="background-color:#f4f3f1;">
    <tr><td align="center" style="padding:38px 14px 30px;">
      <table role="presentation" width="520" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:520px;">
        <tr><td align="center" style="padding:0 0 23px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td valign="middle"><a href="${escapeHtml(origin.toString())}" style="display:block;text-decoration:none;"><img src="${safeLogoUrl}" width="38" height="38" alt="ProPyCoder" style="display:block;width:38px;height:38px;border:0;"></a></td>
            <td valign="middle" style="padding-left:9px;"><a href="${escapeHtml(origin.toString())}" style="color:#292929;font-size:19px;font-weight:700;letter-spacing:-.3px;text-decoration:none;">ProPyCoder</a></td>
          </tr></table>
        </td></tr>
        <tr><td bgcolor="#ffffff" style="border:1px solid #e8e6e2;border-radius:10px;background-color:#ffffff;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr><td style="height:4px;border-radius:10px 10px 0 0;background:#f15a2a;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td class="email-card-content" style="padding:38px 40px 34px;">
              <p style="margin:0 0 12px;color:#b84c2b;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">PASSWORD RESET</p>
              <h1 class="email-heading" style="margin:0 0 20px;color:#242424;font-size:30px;font-weight:700;line-height:1.18;letter-spacing:-.7px;">Reset your password.</h1>
              <p style="margin:0 0 9px;color:#333;font-size:15px;line-height:1.6;">Hi ${safeName},</p>
              <p style="margin:0 0 27px;color:#626262;font-size:15px;line-height:1.75;">We received a request to reset your ProPyCoder password. Click the button below to choose a new one.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;">
                <tr><td align="center" bgcolor="#e95725" style="border-radius:5px;background-color:#e95725;">
                  <a href="${safeUrl}" style="display:inline-block;padding:15px 25px;border:1px solid #e95725;border-radius:5px;color:#ffffff;font-size:14px;font-weight:700;line-height:1.2;text-decoration:none;">Reset my password&nbsp; &#8594;</a>
                </td></tr>
              </table>
              <p style="margin:0 0 25px;color:#858585;font-size:12px;line-height:1.6;">For your security, this one-time link expires in <strong style="color:#555555;">30 minutes</strong>.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="height:1px;background-color:#ecebe8;font-size:0;line-height:0;">&nbsp;</td></tr></table>
              <p style="margin:19px 0 6px;color:#777777;font-size:12px;line-height:1.6;">If the button doesn't work, paste this link into your browser:</p>
              <p style="margin:0 0 20px;word-break:break-all;font-size:12px;line-height:1.6;"><a href="${safeUrl}" style="color:#a94325;text-decoration:underline;">${safeUrl}</a></p>
              <p style="margin:0;color:#777777;font-size:12px;line-height:1.65;">Didn't request a password reset? You can safely ignore this message.</p>
            </td></tr>
            <tr><td align="center" style="padding:19px 24px 20px;border-top:1px solid #ecebe8;background-color:#faf9f7;">
              <p style="margin:0 0 6px;color:#555555;font-size:12px;font-weight:700;line-height:1.6;">Practical skills. Real projects. Your next chapter.</p>
              <p style="margin:0;color:#777777;font-size:11px;line-height:1.6;">Need help? <a href="mailto:support@propycoder.com" style="color:#a94325;text-decoration:underline;">support@propycoder.com</a></p>
              <p style="margin:8px 0 0;color:#858585;font-size:10px;line-height:1.5;">© ProPyCoder · This is an account-related message.</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:12px 18px 0;color:#888888;font-size:10px;line-height:1.55;">You're receiving this because a password reset was requested for this email address.</td></tr>
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