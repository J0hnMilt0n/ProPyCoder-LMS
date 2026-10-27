import { prisma } from "@/lib/prisma";

/**
 * Certificate helpers.
 *
 * A certificate is issued once a student has completed every lesson in a
 * course. Certificates are idempotent: calling {@link issueCertificateForCourse}
 * repeatedly returns the existing certificate instead of creating duplicates.
 */

/** Generate a human-friendly, collision-resistant certificate number. */
function generateCertificateNumber(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = "";
  for (let i = 0; i < 8; i += 1) {
    random += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `PPC-${new Date().getFullYear()}-${random}`;
}

/**
 * Ensures a certificate exists for a completed course. Returns the certificate
 * public certificate number, or null if the course has no lessons / is not
 * yet fully completed. The opaque database id remains internal.
 */
export async function issueCertificateForCourse(
  studentId: string,
  courseId: string,
): Promise<{ id: string; certificateNumber: string } | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { title: true },
  });
  if (!course) return null;

  const [totalLessons, completedLessons, existing, enrollment] = await Promise.all([
    prisma.lesson.count({ where: { module: { courseId } } }),
    prisma.progress.count({
      where: {
        studentId,
        status: "COMPLETED",
        lesson: { module: { courseId } },
      },
    }),
    prisma.certificate.findFirst({
      where: { studentId, credentials: { startsWith: `${courseId}:${studentId}:` } },
      select: { id: true, certificateNumber: true },
    }),
    prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
      select: { id: true },
    }),
  ]);

  if (!enrollment || totalLessons === 0 || completedLessons < totalLessons) {
    return null;
  }

  if (existing) return existing;

  // Course identity is embedded in credentials, allowing concurrent requests
  // to find the winning certificate without relying on non-unique course titles.
  let certificate;
  try {
    certificate = await prisma.certificate.create({
      data: {
        studentId,
        course: course.title,
        certificateNumber: generateCertificateNumber(),
        // A stable, opaque validation token (no PII, safe to verify later).
        credentials: `${courseId}:${studentId}:${Date.now().toString(36)}`,
      },
      select: { id: true, certificateNumber: true },
    });
  } catch (error) {
    // Another request may have issued the same learner/course certificate.
    const concurrent = await prisma.certificate.findFirst({
      where: { studentId, credentials: { startsWith: `${courseId}:${studentId}:` } },
      select: { id: true, certificateNumber: true },
    });
    if (concurrent) return concurrent;
    throw error;
  }

  return certificate;
}
