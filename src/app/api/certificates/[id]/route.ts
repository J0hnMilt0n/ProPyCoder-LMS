import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getCertificateDetail } from "@/lib/page-cache";

interface Props {
  params: Promise<{ id: string }>;
}

// Publicly readable certificate: anyone holding the link can view it —
// no login required. Accepts the human-readable certificate number
// (PPC-2026-XXXXXXXX) or the legacy cuid id, so old links keep working.
export async function GET(_request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const trimmed = id.trim();
    // Certificates are immutable once issued, so this is safe to cache
    // globally and never needs invalidation.
    const certificate = await getCertificateDetail(trimmed, async () =>
      prisma.certificate.findFirst({
        where: {
          OR: [{ certificateNumber: trimmed }, { id: trimmed }],
        },
        include: {
          student: { select: { firstName: true, lastName: true } },
        },
      }),
    );

    if (!certificate) {
      return NextResponse.json(
        { error: "Certificate not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(certificate);
  } catch (error) {
    console.error("Certificate fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch certificate" },
      { status: 500 },
    );
  }
}
