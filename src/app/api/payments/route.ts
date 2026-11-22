
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/route";
import { effectiveCoursePrice } from "@/lib/pricing";
import {
  createPhonePeOrder,
  getPhonePeOrderStatus,
  PhonePeApiError,
} from "@/lib/phonepe";

type ExistingPayment = {
  id: string;
  courseId: string | null;
  bundleId: string | null;
  amount: number;
  status: string;
  checkoutUrl: string | null;
  createdAt: Date;
};

async function verifyExistingCheckout(payment: ExistingPayment) {
  if (!payment.checkoutUrl) {
    return {
      action: "BLOCK" as const,
      message: "Your payment is being initialized. Please retry shortly.",
      status: 409,
    };
  }

  const provider = await getPhonePeOrderStatus(payment.id);
  const state = provider.state?.toUpperCase();

  // Never expire a successfully completed payment.
  if (state === "COMPLETED") {
    return {
      action: "BLOCK" as const,
      message: "Payment is already completed. Please refresh your purchases.",
      status: 409,
    };
  }

  if (state === "FAILED" || state === "EXPIRED") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });

    return { action: "CREATE" as const };
  }

  if (state === "PENDING") {
    const createdAt = new Date(payment.createdAt).getTime();
    const expiresAt = createdAt + 4.51 * 60 * 1000;
    const isExpired = Date.now() >= expiresAt;

    if (!isExpired) {
      return {
        action: "REUSE" as const,
        checkoutUrl: payment.checkoutUrl,
      };
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });

    return { action: "CREATE" as const };
  }

  return {
    action: "BLOCK" as const,
    message: `Unable to verify your previous payment (status: ${state ?? "UNKNOWN"}). Please retry later.`,
    status: 409,
  };
}

// --------------------------------------------------
// GET USER PAYMENT HISTORY
// --------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: { userId: string; status?: string } = {
      userId: session.user.id,
    };

    if (status) {
      where.status = status;
    }

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
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      data: payments,
    });
  } catch (error) {
    console.error("[Payments] Fetch error:", error);

    return NextResponse.json(
      { error: "Failed to fetch payments" },
      { status: 500 }
    );
  }
}

// --------------------------------------------------
// POST CREATE PAYMENT / INITIATE CHECKOUT
// --------------------------------------------------

export async function POST(request: NextRequest) {
  const totalStart = performance.now();

  try {
    // 1. Authentication
    const authStart = performance.now();

    const session = await auth();

    console.info(
      `[Payments] Authentication: ${
        Math.round(performance.now() - authStart)
      }ms`
    );

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2. Validate request
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const {
      courseId,
      bundleId,
    }: {
      courseId?: string;
      bundleId?: string;
    } = body;

    if (
      (!!courseId === !!bundleId) ||
      (courseId !== undefined && typeof courseId !== "string") ||
      (bundleId !== undefined && typeof bundleId !== "string")
    ) {
      return NextResponse.json(
        {
          error: "Provide exactly one of courseId or bundleId",
        },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    // 3. Prepare redirect URL
    const redirectUrl = new URL(
      "/checkout",
      request.url
    );

    // ----------------------------------------------
    // COURSE CHECKOUT
    // ----------------------------------------------

    if (courseId) {
      const dbStart = performance.now();

      // Run independent database queries together.
      const [course, existingEnrollment] =
        await Promise.all([
          prisma.course.findUnique({
            where: {
              id: courseId,
            },
            select: {
              id: true,
              price: true,
              offerPrice: true,
            },
          }),

          prisma.enrollment.findUnique({
            where: {
              studentId_courseId: {
                studentId: userId,
                courseId,
              },
            },
            select: {
              id: true,
            },
          }),
        ]);

      console.info(
        `[Payments] Course DB queries: ${
          Math.round(performance.now() - dbStart)
        }ms`
      );

      if (!course) {
        return NextResponse.json(
          { error: "Course not found" },
          { status: 404 }
        );
      }

      if (existingEnrollment) {
        return NextResponse.json(
          { error: "Already enrolled in this course" },
          { status: 400 }
        );
      }

      const effectiveAmount =
        effectiveCoursePrice(course);

      if (effectiveAmount === 0) {
        return NextResponse.json(
          {
            error:
              "This course is free. Enroll directly without payment.",
          },
          { status: 400 }
        );
      }

      const existingPayment = await prisma.payment.findFirst({
  where: {
    userId,
    courseId,
    paymentMethod: "PHONEPE",
    status: "PENDING",
    amount: effectiveAmount,
  },
  orderBy: { createdAt: "desc" },
  select: {
    id: true,
    courseId: true,
    bundleId: true,
    amount: true,
    status: true,
    checkoutUrl: true,
    createdAt: true,
  },
});

if (existingPayment) {
  const decision = await verifyExistingCheckout(existingPayment);

  if (decision.action === "REUSE") {
    return NextResponse.json({
      id: existingPayment.id,
      courseId: existingPayment.courseId,
      bundleId: null,
      amount: existingPayment.amount,
      status: existingPayment.status,
      isBundle: false,
      checkoutUrl: decision.checkoutUrl,
    });
  }

  if (decision.action === "BLOCK") {
    return NextResponse.json(
      { error: decision.message },
      { status: decision.status }
    );
  }
}

      // Create payment record.
      const createStart = performance.now();

      const payment = await prisma.payment.create({
        data: {
          userId,
          courseId,
          amount: effectiveAmount,
          currency: "INR",
          status: "PENDING",
          paymentMethod: "PHONEPE",
        },
        select: {
          id: true,
          courseId: true,
          amount: true,
          status: true,
        },
      });

      console.info(
        `[Payments] Course payment creation: ${
          Math.round(performance.now() - createStart)
        }ms`
      );

      // Create PhonePe checkout.
      redirectUrl.searchParams.set("phonepe", "return");

      const phonePeStart = performance.now();

      const checkout = await createPhonePeOrder({
        paymentId: payment.id,
        amountRupees: payment.amount,
        redirectUrl: new URL(
          `/checkout/${payment.id}?phonepe=return`,
          request.url
        ).toString(),
      });
      await prisma.payment.update({
  where: { id: payment.id },
  data: {
    checkoutUrl: checkout.redirectUrl,
  },
});
      console.info(
        `[Payments] PhonePe checkout: ${
          Math.round(performance.now() - phonePeStart)
        }ms`
      );

      console.info(
        `[Payments] Total course checkout: ${
          Math.round(performance.now() - totalStart)
        }ms`
      );

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

    // ----------------------------------------------
    // BUNDLE CHECKOUT
    // ----------------------------------------------

    const bundleDbStart = performance.now();

    const bundle = await prisma.bundle.findFirst({
      where: {
        id: bundleId,
        status: "PUBLISHED",
      },
      select: {
        id: true,
        title: true,
        price: true,
        courses: {
          select: {
            courseId: true,
            course: {
              select: {
                price: true,
                offerPrice: true,
              },
            },
          },
        },
      },
    });

    console.info(
      `[Payments] Bundle lookup: ${
        Math.round(performance.now() - bundleDbStart)
      }ms`
    );

    if (!bundle) {
      return NextResponse.json(
        { error: "Bundle not found" },
        { status: 404 }
      );
    }

    if (
      !bundle.courses.length ||
      bundle.price <= 0
    ) {
      return NextResponse.json(
        {
          error: "This bundle is not available for purchase",
        },
        { status: 400 }
      );
    }

    // Fetch owned courses.
    const enrollmentStart = performance.now();

    const ownedEnrollments =
      await prisma.enrollment.findMany({
        where: {
          studentId: userId,
          courseId: {
            in: bundle.courses.map(
              ({ courseId }) => courseId
            ),
          },
        },
        select: {
          courseId: true,
        },
      });

    console.info(
      `[Payments] Bundle enrollment lookup: ${
        Math.round(performance.now() - enrollmentStart)
      }ms`
    );

    if (
      ownedEnrollments.length ===
      bundle.courses.length
    ) {
      return NextResponse.json(
        {
          error:
            "You already have every course in this bundle",
        },
        { status: 400 }
      );
    }

    // Calculate personalized bundle price.
    const ownedCourseIds = new Set(
      ownedEnrollments.map(
        ({ courseId }) => courseId
      )
    );

    const ownedValue = bundle.courses.reduce(
      (total, { courseId, course }) => {
        return (
          total +
          (ownedCourseIds.has(courseId)
            ? effectiveCoursePrice(course)
            : 0)
        );
      },
      0
    );

    const amount = Math.max(
      0,
      bundle.price - ownedValue
    );

    if (amount <= 0) {
      return NextResponse.json(
        {
          error:
            "There is no remaining balance for this bundle",
        },
        { status: 400 }
      );
    }

    const existingPayment = await prisma.payment.findFirst({
  where: {
    userId,
    bundleId: bundle.id,
    paymentMethod: "PHONEPE",
    status: "PENDING",
    amount,
  },
  orderBy: { createdAt: "desc" },
  select: {
    id: true,
    courseId: true,
    bundleId: true,
    amount: true,
    status: true,
    checkoutUrl: true,
    createdAt: true,
  },
});

if (existingPayment) {
  const decision = await verifyExistingCheckout(existingPayment);

  if (decision.action === "REUSE") {
    return NextResponse.json({
      id: existingPayment.id,
      courseId: null,
      bundleId: existingPayment.bundleId,
      amount: existingPayment.amount,
      status: existingPayment.status,
      isBundle: true,
      checkoutUrl: decision.checkoutUrl,
    });
  }

  if (decision.action === "BLOCK") {
    return NextResponse.json(
      { error: decision.message },
      { status: decision.status }
    );
  }
}

    // Create payment record.
    const createStart = performance.now();

    const payment = await prisma.payment.create({
      data: {
        userId,
        bundleId: bundle.id,
        amount,
        currency: "INR",
        status: "PENDING",
        paymentMethod: "PHONEPE",
      },
      select: {
        id: true,
        bundleId: true,
        amount: true,
        status: true,
      },
    });

    console.info(
      `[Payments] Bundle payment creation: ${
        Math.round(performance.now() - createStart)
      }ms`
    );

    // Create PhonePe checkout.
    const phonePeStart = performance.now();

    const checkout = await createPhonePeOrder({
      paymentId: payment.id,
      amountRupees: payment.amount,
      redirectUrl: new URL(
        `/checkout/${payment.id}?phonepe=return`,
        request.url
      ).toString(),
    });

    await prisma.payment.update({
  where: { id: payment.id },
  data: {
    checkoutUrl: checkout.redirectUrl,
  },
});

    console.info(
      `[Payments] PhonePe checkout: ${
        Math.round(performance.now() - phonePeStart)
      }ms`
    );

    console.info(
      `[Payments] Total bundle checkout: ${
        Math.round(performance.now() - totalStart)
      }ms`
    );

    return NextResponse.json({
      id: payment.id,
      courseId: null,
      bundleId: payment.bundleId,
      amount: payment.amount,
      status: payment.status,
      isBundle: true,
      checkoutUrl: checkout.redirectUrl,
    });

  } catch (error) {
    console.error(
      "[Payments] Payment creation error:",
      error
    );

    if (error instanceof PhonePeApiError) {
      return NextResponse.json(
        {
          error:
            "PhonePe could not create the checkout order",
          providerCode: error.providerCode,
          providerMessage: error.providerMessage,
        },
        { status: 502 }
      );
    }

    if (
      error instanceof Error &&
      error.name === "TimeoutError"
    ) {
      return NextResponse.json(
        {
          error: "PhonePe request timed out. Please check payment status before retrying.",
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create payment" },
      { status: 500 }
    );
  }
}
