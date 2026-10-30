import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_TTL_MS = 30 * 60 * 1000;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export function createEmailVerificationToken() {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) };
}

export async function sendVerificationEmail(input: {
  email: string;
  firstName: string;
  token: string;
}) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || "ProPyCoder";
  const baseUrl = process.env.NEXTAUTH_URL;

  if (!apiKey || !senderEmail || !baseUrl) {
    throw new Error("Brevo email verification is not configured");
  }

  const origin = new URL(baseUrl);
  if (origin.protocol !== "https:" && origin.hostname !== "localhost") {
    throw new Error("NEXTAUTH_URL must use HTTPS for email verification");
  }

  const verifyUrl = new URL("/auth/verify-email", origin);
  verifyUrl.searchParams.set("token", input.token);
  const logoUrl = new URL("/propycoder-logo.png", origin).toString();
  const safeName = escapeHtml(input.firstName);
  const safeUrl = escapeHtml(verifyUrl.toString());
  const safeLogoUrl = escapeHtml(logoUrl);

  const textContent = [
    `Hi ${input.firstName},`,
    "",
    "Welcome to ProPyCoder.",
    "",
    "You’re almost ready to learn by building. Confirm your email address to activate your account:",
    verifyUrl.toString(),
    "",
    "This secure link expires in 30 minutes and can only be used once.",
    "If you did not create a ProPyCoder account, you can safely ignore this email.",
    "",
    "Practical skills. Real projects. Your next chapter.",
    "Need help? support@propycoder.com",
    "© ProPyCoder · This is an account-related message.",
    "You’re receiving this because an account was created using this email address.",
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
  <title>Confirm your email | ProPyCoder</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f3f1;font-family:Arial,Helvetica,sans-serif;color:#252525;-webkit-text-size-adjust:100%;">
  <div style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">One quick step to activate your ProPyCoder account. Your confirmation link is ready inside.</div>
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
              <p style="margin:0 0 12px;color:#b84c2b;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">WELCOME TO PROPYCODER</p>
              <h1 class="email-heading" style="margin:0 0 20px;color:#242424;font-size:30px;font-weight:700;line-height:1.18;letter-spacing:-.7px;">You’re almost in.</h1>
              <p style="margin:0 0 9px;color:#333;font-size:15px;line-height:1.6;">Hi ${safeName},</p>
              <p style="margin:0 0 27px;color:#626262;font-size:15px;line-height:1.75;">One quick confirmation and your ProPyCoder account is ready. Verify your email to get started.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;">
                <tr><td align="center" bgcolor="#e95725" style="border-radius:5px;background-color:#e95725;">
                  <a href="${safeUrl}" style="display:inline-block;padding:15px 25px;border:1px solid #e95725;border-radius:5px;color:#ffffff;font-size:14px;font-weight:700;line-height:1.2;text-decoration:none;">Verify my email&nbsp; &#8594;</a>
                </td></tr>
              </table>
              <p style="margin:0 0 25px;color:#858585;font-size:12px;line-height:1.6;">For your security, this one-time link expires in <strong style="color:#555555;">30 minutes</strong>.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="height:1px;background-color:#ecebe8;font-size:0;line-height:0;">&nbsp;</td></tr></table>
              <p style="margin:19px 0 6px;color:#777777;font-size:12px;line-height:1.6;">If the button doesn’t work, paste this link into your browser:</p>
              <p style="margin:0 0 20px;word-break:break-all;font-size:12px;line-height:1.6;"><a href="${safeUrl}" style="color:#a94325;text-decoration:underline;">${safeUrl}</a></p>
              <p style="margin:0;color:#777777;font-size:12px;line-height:1.65;">Didn’t sign up for ProPyCoder? You can safely ignore this message.</p>
            </td></tr>
            <tr><td align="center" style="padding:19px 24px 20px;border-top:1px solid #ecebe8;background-color:#faf9f7;">
              <p style="margin:0 0 6px;color:#555555;font-size:12px;font-weight:700;line-height:1.6;">Practical skills. Real projects. Your next chapter.</p>
              <p style="margin:0;color:#777777;font-size:11px;line-height:1.6;">Need help? <a href="mailto:support@propycoder.com" style="color:#a94325;text-decoration:underline;">support@propycoder.com</a></p>
              <p style="margin:8px 0 0;color:#858585;font-size:10px;line-height:1.5;">© ProPyCoder · This is an account-related message.</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:12px 18px 0;color:#888888;font-size:10px;line-height:1.55;">You’re receiving this because an account was created using this email address.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: input.email, name: input.firstName }],
      subject: "Verify your ProPyCoder email address",
      textContent,
      htmlContent,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    // Brevo error bodies can explain rejected API keys/senders. Log only its
    // short message/code and never the request headers or credentials.
    let detail = "";
    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === "object") {
        const error = payload as { message?: unknown; code?: unknown };
        const message = typeof error.message === "string" ? error.message : "";
        const code = typeof error.code === "string" ? error.code : "";
        detail = [code, message].filter(Boolean).join(": ").slice(0, 240);
      }
    } catch {
      // The HTTP status remains useful when Brevo returns a non-JSON response.
    }
    console.error("Brevo verification email request failed", response.status);
    if (detail) console.error("Brevo response:", detail);
    throw new Error(`Could not send verification email (Brevo HTTP ${response.status})`);
  }
}

export async function issueVerificationEmail(user: {
  id: string;
  email: string;
  firstName: string;
}) {
  const verification = createEmailVerificationToken();
  const updated = await prisma.user.updateMany({
    where: { id: user.id, emailVerified: false, emailVerificationTokenHash: null },
    data: {
      emailVerificationTokenHash: verification.tokenHash,
      emailVerificationExpiresAt: verification.expiresAt,
    },
  });
  if (updated.count !== 1) throw new Error("Could not create verification token");

  try {
    await sendVerificationEmail({
      email: user.email,
      firstName: user.firstName,
      token: verification.token,
    });
  } catch {
    await prisma.user.deleteMany({
      where: { id: user.id, emailVerified: false, emailVerificationTokenHash: verification.tokenHash },
    });
    throw new Error("Could not deliver verification email");
  }
}

export async function verifyEmailToken(token: string) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const user = await prisma.user.findFirst({
    where: {
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: { gt: new Date() },
      emailVerified: false,
    },
    select: { id: true },
  });

  if (!user) return false;

  const result = await prisma.user.updateMany({
    where: {
      id: user.id,
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: { gt: new Date() },
      emailVerified: false,
    },
    data: {
      emailVerified: true,
      emailVerificationTokenHash: null,
      emailVerificationExpiresAt: null,
    },
  });
  return result.count === 1;
}