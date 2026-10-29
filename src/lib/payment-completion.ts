import { prisma } from "@/lib/prisma";
import { invalidateCatalog, invalidateCourse } from "@/lib/course-cache";
import {
  NS,
  invalidateAdminOverview,
  invalidateHome,
  invalidateUser,
} from "@/lib/page-cache";
import type { PhonePeOrderStatus } from "@/lib/phonepe";

export async function completePhonePePayment(
  id: string,
  userId: string,
  provider: PhonePeOrderStatus,
) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { course: true, bundle: { include: { courses: true } } },
  });
  if (!payment || payment.userId !== userId) throw new Error("Payment not found");
  if (payment.status === "COMPLETED") return { success: true, alreadyCompleted: true };
  if (payment.status !== "PENDING" || payment.paymentMethod !== "PHONEPE") {
    throw new Error("Payment is not eligible for completion");
  }

  const detail = provider.paymentDetails?.find(
    (attempt) => attempt.state === "COMPLETED" && attempt.transactionId,
  );
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id, userId, status: "PENDING", paymentMethod: "PHONEPE" },
      data: {
        status: "COMPLETED",
        transactionId: detail?.transactionId ?? id,
        paymentMethod: detail?.paymentMode ?? "PHONEPE",
      },
    });
    if (claimed.count !== 1) throw new Error("Payment was already processed");

    let enrollments: { id: string; courseId: string }[];
    if (payment.bundleId && payment.bundle) {
      const courseIds = payment.bundle.courses.map(({ courseId }) => courseId);
      await tx.enrollment.createMany({
        data: courseIds.map((courseId) => ({ studentId: userId, courseId, status: "ACTIVE" })),
        skipDuplicates: true,
      });
      enrollments = await tx.enrollment.findMany({
        where: { studentId: userId, courseId: { in: courseIds } },
        select: { id: true, courseId: true },
      });
    } else if (payment.courseId) {
      const enrollment = await tx.enrollment.upsert({
        where: { studentId_courseId: { studentId: userId, courseId: payment.courseId } },
        create: { studentId: userId, courseId: payment.courseId, status: "ACTIVE" },
        update: { status: "ACTIVE" },
        select: { id: true, courseId: true },
      });
      enrollments = [enrollment];
    } else {
      throw new Error("Payment has neither course nor bundle");
    }

    const updatedPayment = await tx.payment.update({
      where: { id },
      data: { enrollmentId: enrollments[0]?.id ?? null },
    });
    return { payment: updatedPayment, enrollments };
  });

  for (const courseId of new Set(result.enrollments.map(({ courseId }) => courseId))) {
    invalidateCourse(courseId);
  }
  invalidateCatalog();
  invalidateUser(NS.enrollments, userId);
  invalidateUser(NS.purchasedCourses, userId);
  invalidateAdminOverview();
  invalidateHome();

  return {
    success: true,
    payment: result.payment,
    enrollments: result.enrollments,
    enrollment: result.enrollments[0] ?? null,
    message: payment.bundleId
      ? "Payment successful! Your courses are unlocked."
      : "Payment successful! You are now enrolled in the course.",
  };
}

export async function completePhonePePaymentFromWebhook(
  id: string,
  userId: string,
  provider: PhonePeOrderStatus,
) {
  return completePhonePePayment(id, userId, provider);
}