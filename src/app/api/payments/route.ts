import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/route";

// GET user's payment history
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: any = { userId: session.user.id };
    if (status) where.status = status;

    const payments = await prisma.payment.findMany({
      where,
      include: {
        course: {
          include: {
            instructor: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: payments });
  } catch (error) {
    console.error("Payment fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch payments" },
      { status: 500 }
    );
  }
}

// POST create payment (initiate checkout)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { courseId, paymentMethod = "STRIPE" } = body;

    // Get course details
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 }
      );
    }

    if (course.price === 0) {
      return NextResponse.json(
        { error: "This course is free. Enroll directly without payment." },
        { status: 400 }
      );
    }

    // Check if already enrolled
    const existingEnrollment = await prisma.enrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId: session.user.id,
          courseId,
        },
      },
    });

    if (existingEnrollment) {
      return NextResponse.json(
        { error: "Already enrolled in this course" },
        { status: 400 }
      );
    }

    // Check for existing pending payment
    const existingPayment = await prisma.payment.findFirst({
      where: {
        userId: session.user.id,
        courseId,
        status: "PENDING",
      },
    });

    if (existingPayment) {
      return NextResponse.json({
        id: existingPayment.id,
        courseId,
        amount: existingPayment.amount,
        status: "PENDING",
        message: "Payment already initiated",
      });
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        userId: session.user.id,
        courseId,
        amount: course.price,
        currency: "USD",
        status: "PENDING",
        paymentMethod,
      },
      include: {
        course: true,
      },
    });

    return NextResponse.json({
      id: payment.id,
      courseId,
      amount: payment.amount,
      status: payment.status,
      // In production, you would return a checkout URL from Stripe/PayPal
      checkoutUrl: `/api/payments/${payment.id}/complete`,
    });
  } catch (error) {
    console.error("Payment creation error:", error);
    return NextResponse.json(
      { error: "Failed to create payment" },
      { status: 500 }
    );
  }
}