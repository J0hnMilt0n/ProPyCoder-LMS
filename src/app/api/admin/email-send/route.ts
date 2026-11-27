import { auth } from "@/app/api/auth/[...nextauth]/route";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateEmailTemplate } from "@/lib/email-templates";
import { EMAIL_TIMEOUT_MS } from "@/lib/config";
import { logger } from "@/lib/logger";

const emailSendInput = z.object({
  templateType: z
    .enum([
      "password-reset",
      "email-verification",
      "announcement",
      "instructor-recruitment",
    ])
    .optional(),
  data: z.record(z.string(), z.any()).optional(),
  customSubject: z.string().optional(),
  customHtml: z.string().optional(),
  senderEmail: z.string().email().optional(),
  to: z.string().email().max(254),
  recipient: z.string().email().max(254).optional(),
});

// POST send a formatted email to a single recipient (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = emailSendInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid email data" },
        { status: 400 },
      );
    }

    const { templateType, data, customSubject, customHtml, to, recipient } =
      parsed.data;
    const effectiveRecipient = to || recipient!;
    const effectiveTemplateType = templateType || "instructor-recruitment";
    const effectiveData = data || {};
    const email = generateEmailTemplate({
      templateType: effectiveTemplateType,
      data: effectiveData,
      customSubject,
      customHtml,
    });

    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail =
      parsed.data.senderEmail || process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME?.trim() || "ProPyCoder";

    if (!apiKey || !senderEmail) {
      return NextResponse.json(
        {
          error:
            "Email sending is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL missing)",
        },
        { status: 503 },
      );
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: effectiveRecipient }],
        subject: email.subject,
        textContent: email.textContent,
        htmlContent: email.htmlContent,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const payload: unknown = await response.json();
        if (payload && typeof payload === "object") {
          const error = payload as { message?: unknown; code?: unknown };
          const message =
            typeof error.message === "string" ? error.message : "";
          const code = typeof error.code === "string" ? error.code : "";
          detail = [code, message].filter(Boolean).join(": ").slice(0, 240);
        }
      } catch {
        // The HTTP status remains useful when Brevo returns a non-JSON response.
      }
      logger.error("Brevo email send request failed", {
        metadata: { status: response.status, detail },
      });
      return NextResponse.json(
        { error: `Could not send email (Brevo HTTP ${response.status})` },
        { status: 502 },
      );
    }

    return NextResponse.json({
      sent: true,
      recipient: effectiveRecipient,
      subject: email.subject,
    });
  } catch (error) {
    logger.error("Email send error", {
      cause: error instanceof Error ? error : undefined,
      metadata: { error: String(error) },
    });
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 },
    );
  }
}
