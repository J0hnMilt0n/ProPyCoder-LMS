import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/certificates/verify?number=PPC-2026-XXXX
//
// Look up a certificate by its human-readable number. Certificate numbers are
// public by design, so anyone can verify a certificate without logging in. A
// certificate number is unique, so a lookup by number can only ever return that
// single certificate — no per-user ownership check is required.
export async function GET(request: NextRequest) {
  try {
    const number = request.nextUrl.searchParams.get("number");
    if (!number) {
      return NextResponse.json(
        { error: "Certificate number is required" },
        { status: 400 },
      );
    }

    const certificate = await prisma.certificate.findUnique({
      where: { certificateNumber: number },
      include: {
        student: { select: { firstName: true, lastName: true } },
      },
    });

    if (!certificate) {
      return NextResponse.json(
        { error: "No certificate found with that number" },
        { status: 404 },
      );
    }

    return NextResponse.json(certificate);
  } catch (error) {
    console.error("Certificate verify error:", error);
    return NextResponse.json(
      { error: "Failed to verify certificate" },
      { status: 500 },
    );
  }
}