import { auth } from "@/app/api/auth/[...nextauth]/route";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateEmailTemplate } from "@/lib/email-templates";

const emailPreviewInput = z.object({
  templateType: z
    .enum(["password-reset", "email-verification", "announcement", "instructor-recruitment"])
    .optional(),
  data: z.record(z.string(), z.any()).optional(),
  customSubject: z.string().optional(),
  customHtml: z.string().optional(),
  senderEmail: z.string().email().optional(),
});

// POST generate an email preview (admin only) — renders the same formatted
// HTML the send route will actually dispatch via Brevo.
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = emailPreviewInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid preview data" },
        { status: 400 },
      );
    }

    const { templateType, data, customSubject, customHtml, senderEmail } = parsed.data;
    const preview = generateEmailTemplate({
      templateType: templateType || "instructor-recruitment",
      data: data || {},
      customSubject,
      customHtml,
    });
    return NextResponse.json(preview);
  } catch (error) {
    console.error("Email preview error:", error);
    return NextResponse.json(
      { error: "Failed to generate email preview" },
      { status: 500 },
    );
  }
}
