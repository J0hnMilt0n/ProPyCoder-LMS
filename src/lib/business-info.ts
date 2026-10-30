/** Public business details required for payment-provider website verification. */
export const businessInfo = {
  // Public contact details supplied in the local environment. Keep env
  // overrides for deployments; these values are safe to display publicly.
  legalName: process.env.BUSINESS_LEGAL_NAME?.trim() || "ProPyCoder",
  supportEmail: process.env.BUSINESS_SUPPORT_EMAIL?.trim() || "support@propycoder.com",
  supportPhone: process.env.BUSINESS_SUPPORT_PHONE?.trim() || "+917373367802",
  businessAddress: process.env.BUSINESS_ADDRESS?.trim() || "Bangalore, India",
  // Digital-course policy defaults. Operators can override these in the
  // protected deployment environment after reviewing them for their business.
  refundPolicy: process.env.BUSINESS_REFUND_POLICY?.trim() ||
    "All course sales are final. We do not offer refunds or cancellations once an order is placed, except where a refund is required by applicable law or where a payment was duplicated, collected without a successful order, or course access was not provided due to an issue on our side. Contact support with your order reference so we can investigate and, where appropriate, arrange a correction or refund.",
  accessPolicy: process.env.BUSINESS_ACCESS_POLICY?.trim() ||
    "After PhonePe or another payment provider confirms successful payment, course access is provided through the learner account used for the purchase. Sign in and open your learning dashboard to access the course. Access is for the purchasing account and is not transferable. If access is missing after successful payment, contact support with your account email and order reference. Course availability and included materials are as described on the relevant course page; access duration is not guaranteed beyond what that page expressly states.",
};