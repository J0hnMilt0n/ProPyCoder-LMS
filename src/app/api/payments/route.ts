
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/route";
import { effectiveCoursePrice } from "@/lib/pricing";
import {
  createPhonePeOrder,
  PhonePeApiError,
} from "@/lib/phonepe";

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
