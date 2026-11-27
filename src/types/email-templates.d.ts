export interface PasswordResetEmailData {
  firstName?: string;
  resetUrl?: string;
}

export interface EmailVerificationEmailData {
  firstName?: string;
  verifyUrl?: string;
}

export interface AnnouncementEmailData {
  title?: string;
  message?: string;
  link?: string;
}

export interface InstructorRecruitmentEmailData {
  firstName?: string;
}

export type EmailTemplateData =
  | PasswordResetEmailData
  | EmailVerificationEmailData
  | AnnouncementEmailData
  | InstructorRecruitmentEmailData;
