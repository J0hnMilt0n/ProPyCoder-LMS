import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/route";
import { effectiveCoursePrice } from "@/lib/pricing";
import { createPhonePeOrder } from "@/lib/phonepe";

// GET user's payment history
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: { userId: string; status?: string } = {
      userId: session.user.id,
    };
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

// POST create payment (initiate checkout) — for a course OR a bundle.
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { courseId, bundleId }: { courseId?: string; bundleId?: string } = body;

    if ((!courseId && !bundleId) || (courseId && bundleId)) {
      return NextResponse.json(
        { error: "Provide exactly one of courseId or bundleId" },
        { status: 400 }
      );
    }

    const where = { userId: session.user.id, status: "PENDING" as const };

    if (courseId) {
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true, price: true, offerPrice: true },
      });

      if (!course) {
        return NextResponse.json(
          { error: "Course not found" },
          { status: 404 }
        );
      }

      // Buyers pay the offer price when one is set and valid.
      const effectiveAmount = effectiveCoursePrice(course);

      if (effectiveAmount === 0) {
        return NextResponse.json(
          { error: "This course is free. Enroll directly without payment." },
          { status: 400 }
        );
      }

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

      const existingPayment = await prisma.payment.findFirst({
        where: { ...where, courseId },
      });

      if (existingPayment && existingPayment.amount === effectiveAmount && existingPayment.paymentMethod === "PHONEPE") {
        const checkout = await createPhonePeOrder({
          paymentId: existingPayment.id,
          amountRupees: existingPayment.amount,
          redirectUrl: new URL(`/checkout/${existingPayment.id}?phonepe=return`, request.url).toString(),
        });
        return NextResponse.json({
          id: existingPayment.id,
          courseId,
          bundleId: null,
          amount: existingPayment.amount,
          status: "PENDING",
          isBundle: false,
          message: "Payment already initiated",
          checkoutUrl: checkout.redirectUrl,
        });
      }
      const payment = existingPayment
        ? await prisma.payment.update({
            where: { id: existingPayment.id },
            data: { amount: effectiveAmount, paymentMethod: "PHONEPE", transactionId: null },
            include: {
              course: true,
              bundle: { include: { courses: { include: { course: true } } } },
            },
          })
        : await prisma.payment.create({
        data: {
          userId: session.user.id,
          courseId,
          amount: effectiveAmount,
          currency: "INR",
          status: "PENDING",
          paymentMethod: "PHONEPE",
        },
        include: {
          course: true,
          bundle: {
            include: { courses: { include: { course: true } } },
          },
        },
          });

      const checkout = await createPhonePeOrder({
        paymentId: payment.id,
        amountRupees: payment.amount,
        redirectUrl: new URL(`/checkout/${payment.id}?phonepe=return`, request.url).toString(),
      });
      return NextResponse.json({
        id: payment.id,
        courseId: payment.courseId,
        bundleId: null,
        amount: payment.amount,
        status: payment.status,
        isBundle: false,
        checkoutUrl: checkout.redirectUrl,
      });
    }

    // ---- Bundle checkout ----
    const bundle = await prisma.bundle.findFirst({
      where: { id: bundleId, status: "PUBLISHED" },
      select: {
        id: true,
        title: true,
        price: true,
        courses: {
          select: {
            courseId: true,
            course: { select: { price: true, offerPrice: true } },
          },
        },
      },
    });

    if (!bundle) {
      return NextResponse.json(
        { error: "Bundle not found" },
        { status: 404 }
      );
    }

    if (!bundle.courses.length || bundle.price <= 0) {
      return NextResponse.json(
        { error: "This bundle is not available for purchase" },
        { status: 400 }
      );
    }

    // Subtract the effective standalone price for courses already owned,
    // matching the personalized bundle price shown on the detail page.
    const ownedEnrollments = await prisma.enrollment.findMany({
      where: {
        studentId: session.user.id,
        courseId: { in: bundle.courses.map((c) => c.courseId) },
      },
      select: { courseId: true },
    });
    if (ownedEnrollments.length === bundle.courses.length) {
      return NextResponse.json(
        { error: "You already have every course in this bundle" },
        { status: 400 }
      );
    }

    const ownedCourseIds = new Set(ownedEnrollments.map(({ courseId }) => courseId));
    const ownedValue = bundle.courses.reduce(
      (total, { courseId, course }) =>
        total +
        (ownedCourseIds.has(courseId) ? effectiveCoursePrice(course) : 0),
      0,
    );
    const amount = Math.max(0, bundle.price - ownedValue);
    if (amount <= 0) {
      return NextResponse.json(
        { error: "There is no remaining balance for this bundle" },
        { status: 400 }
      );
    }

    const existingBundlePayment = await prisma.payment.findFirst({
      where: { ...where, bundleId: bundle.id },
    });

    if (existingBundlePayment) {
      const refreshedPayment =
        existingBundlePayment.amount === amount
          ? existingBundlePayment
          : await prisma.payment.update({
              where: { id: existingBundlePayment.id },
              data: { amount },
            });
      const checkout = await createPhonePeOrder({
        paymentId: refreshedPayment.id,
        amountRupees: refreshedPayment.amount,
        redirectUrl: new URL(`/checkout/${refreshedPayment.id}?phonepe=return`, request.url).toString(),
      });
      return NextResponse.json({
        id: refreshedPayment.id,
        courseId: null,
        bundleId: bundle.id,
        amount: refreshedPayment.amount,
        status: "PENDING",
        isBundle: true,
        message: "Payment already initiated",
        checkoutUrl: checkout.redirectUrl,
      });
    }

    const payment = await prisma.payment.create({
      data: {
        userId: session.user.id,
        bundleId: bundle.id,
        amount,
        currency: "INR",
        status: "PENDING",
        paymentMethod: "PHONEPE",
      },
      include: {
        course: true,
        bundle: {
          include: { courses: { include: { course: true } } },
        },
      },
    });

    const checkout = await createPhonePeOrder({
      paymentId: payment.id,
      amountRupees: payment.amount,
      redirectUrl: new URL(`/checkout/${payment.id}?phonepe=return`, request.url).toString(),
    });
    return NextResponse.json({
      id: payment.id,
      courseId: null,
      bundleId: bundle.id,
      amount: payment.amount,
      status: payment.status,
      isBundle: true,
      checkoutUrl: checkout.redirectUrl,
    });
  } catch (error) {
    console.error("Payment creation error:", error);
    return NextResponse.json(
      { error: "Failed to create payment" },
      { status: 500 }
    );
  }
}