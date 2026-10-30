# Merchant website verification checklist

## Signup email verification

New student registrations require a one-time email confirmation before sign-in.
Configure `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` (a verified Brevo sender),
`BREVO_SENDER_NAME`, and the public HTTPS `NEXTAUTH_URL` in the deployment
environment. Apply the database changes with the deployment's normal Prisma
schema update process. Verification links expire after 30 minutes; users can
request another from `/auth/verify-email`.

The policy pages are available at `/terms`, `/privacy-policy`, `/refund-policy`, and `/contact`, and are linked in the public homepage footer.

Public policy pages use the supplied ProPyCoder contact details (support@propycoder.com, +91 73733 67802, Bangalore, India). The refund and course-access pages use the policy wording in `src/lib/business-info.ts`; environment variables can override it.

Before requesting another PhonePe website review:

1. Confirm the displayed name and Bangalore location match the information in your merchant application; add a complete registered/business address if needed.
2. Confirm the support email and phone are monitored and the no-refund policy matches your actual business practice and applicable requirements.
3. Review each policy page for accuracy, including data practices, course delivery, pricing, and refund handling.
4. Confirm the production site and all policy URLs work publicly over HTTPS and the footer links work on mobile and desktop.
5. Request another review in the PhonePe merchant onboarding dashboard. If rejected again, ask PhonePe support for the specific policy finding.

Do not put PhonePe secrets or other private credentials in public pages or commit them to source control. Configure payment credentials separately in the hosting provider's protected environment settings.