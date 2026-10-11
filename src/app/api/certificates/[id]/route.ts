import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

interface Props {
  params: Promise<{ id: string }>;
}

// Publicly readable certificate: anyone with the certificate id (obtained by
// verifying a certificate number) can view it — no login required.
export async function GET(_request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const certificate = await prisma.certificate.findUnique({
      where: { id },
      include: {
        student: { select: { firstName: true, lastName: true } },
      },
    });

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
