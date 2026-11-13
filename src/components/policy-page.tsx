
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { BrandLogo } from "@/components/brand-logo";
import { businessInfo } from "@/lib/business-info";

type PolicyKind = "terms" | "privacy" | "refund" | "contact";

const titles: Record<PolicyKind, string> = {
  terms: "Terms and Conditions",
  privacy: "Privacy Policy",
  refund: "Refund and Cancellation Policy",
  contact: "Contact and Support",
};

const introductions: Record<PolicyKind, string> = {
  terms:
    "Please review these terms before using the ProPyCoder learning platform or purchasing a course.",
  privacy:
    "This Privacy Policy explains how ProPyCoder collects, uses, stores, and protects your personal information.",
  refund:
    "Review the refund and cancellation conditions applicable to digital course and bundle purchases.",
  contact:
    "Contact ProPyCoder for assistance with accounts, courses, payments, privacy, or refunds.",
};

const updatedDate = "November 07, 2026";

export function PolicyPage({ kind }: { kind: PolicyKind }) {
  const supportEmail = businessInfo.supportEmail;
  const supportPhone = businessInfo.supportPhone;

  return (
    <main className="site-home policy-page">
      <Navbar />

      <header className="about-hero policy-hero">
        <div className="about-hero-inner">
          <div className="home-section-eyebrow">
            PRO PYCODER · WEBSITE INFORMATION
          </div>

          <h1>{titles[kind]}</h1>
          <p>{introductions[kind]}</p>

          <p className="policy-updated">
            Last updated: {updatedDate}
          </p>
        </div>
      </header>

      <article className="policy-content about-main-section">

        {/* BUSINESS INFORMATION */}

        <section className="policy-operator">
          <h2>Business Information</h2>

          <p>
          Operator Name: {businessInfo.legalName}
          </p>

  

          <p>
            Business Location: {businessInfo.businessAddress}
          </p>

      

          <p>
            Support Email:{" "}
            <a href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
          </p>

          <p>
            Support Phone:{" "}
            <a href={`tel:${supportPhone}`}>
              {supportPhone}
            </a>
          </p>
        </section>

        <div className="policy-sections">

          {/* ================================================== */}
          {/* TERMS AND CONDITIONS */}
          {/* ================================================== */}

          {kind === "terms" && (
            <>
              <section>
                <h2>1. Acceptance of Terms</h2>

                <p>
                  These Terms and Conditions govern your access to and
                  use of the ProPyCoder website, learning platform,
                  courses, digital content, and related services
                  (collectively referred to as the "Platform").
                </p>

                <p>
                  By accessing the Platform, creating an account,
                  enrolling in a course, or purchasing any product,
                  you agree to these Terms and Conditions.
                </p>

                <p>
                  If you do not agree with these terms, please
                  discontinue using the Platform.
                </p>
              </section>

              <section>
                <h2>2. About ProPyCoder</h2>

                <p>
                  ProPyCoder is an educational and technical training
                  initiative operated from India. We provide
                  technology education, programming courses,
                  software development training, learning resources,
                  and related digital educational services.
                </p>

                <p>
                  Our educational offerings may include programming,
                  Python, web development, databases, data structures
                  and algorithms, software engineering, and other
                  technology-related subjects.
                </p>
              </section>

              <section>
                <h2>3. Courses and Educational Purpose</h2>

                <p>
                  All courses, tutorials, videos, downloadable
                  materials, demonstrations, and other educational
                  resources are provided for learning and
                  informational purposes.
                </p>

                <p>
                  Course descriptions, topics, prerequisites,
                  estimated duration, and included materials are
                  provided on the relevant course or product page.
                  You should review these details before making
                  a purchase.
                </p>

                <p>
                  We do not guarantee employment, job placement,
                  certification from third-party institutions,
                  income, business success, or any particular
                  professional outcome unless expressly agreed
                  in a separate written arrangement.
                </p>

                <p>
                  Individual learning outcomes depend on your
                  participation, experience, practice, and
                  application of the concepts taught.
                </p>
              </section>

              <section>
                <h2>4. Account Registration and Security</h2>

                <p>
                  Certain Platform features require you to create
                  an account. You agree to provide accurate,
                  complete, and current information during
                  registration.
                </p>

                <p>
                  You are responsible for:
                </p>

                <ul>
                  <li>Maintaining the confidentiality of your login credentials.</li>
                  <li>Keeping your account information accurate and updated.</li>
                  <li>All activities conducted through your account.</li>
                  <li>Notifying us promptly of suspected unauthorized access.</li>
                </ul>

                <p>
                  Accounts are intended for individual use.
                  Sharing account credentials or allowing
                  unauthorized individuals to access purchased
                  courses is prohibited.
                </p>

                <p>
                  We reserve the right to restrict, suspend, or
                  terminate accounts involved in unauthorized
                  sharing, misuse, fraudulent activity, or
                  violations of these Terms.
                </p>
              </section>

              <section>
                <h2>5. Course Purchases and Orders</h2>

                <p>
                  ProPyCoder offers digital courses, bundles,
                  learning materials, and other educational
                  products through the Platform.
                </p>

                <p>
                  An order is processed after you submit the
                  purchase request and the payment provider
                  confirms successful payment.
                </p>

                <p>
                  Course access is generally granted to the
                  account associated with the purchase after
                  successful payment confirmation.
                </p>

                <p>
                  You are responsible for reviewing the course
                  description, included content, pricing, and
                  applicable requirements before completing
                  your purchase.
                </p>
              </section>

              <section>
                <h2>6. Pricing, Taxes and Payments</h2>

                <p>
                  Prices are displayed in Indian Rupees (INR)
                  unless otherwise specified on the Platform.
                  Applicable taxes, if any, will be reflected
                  during checkout or in the relevant invoice.
                </p>

                <p>
                  Payments are processed through PhonePe or
                  another payment provider made available
                  during checkout.
                </p>

                <p>
                  Payment transactions are subject to the
                  applicable terms and security procedures
                  of the selected payment provider and your
                  bank or payment method.
                </p>

                <p>
                  ProPyCoder records the relevant order details,
                  payment status, and transaction references
                  to verify payments, provide course access,
                  and resolve payment-related issues.
                </p>

                <p>
                  We do not request your UPI PIN, banking
                  password, card security code, or other
                  confidential payment authentication
                  credentials.
                </p>
              </section>

              <section>
                <h2>7. Third-Party Payment Providers</h2>

                <p>
                  When you make a payment through PhonePe or
                  another payment provider, certain information
                  necessary to process the transaction may be
                  shared with that provider.
                </p>

                <p>
                  The payment provider processes the transaction
                  under its own terms, privacy policy, and
                  applicable security procedures.
                </p>

                <p>
                  ProPyCoder is not responsible for technical
                  interruptions, payment processing delays,
                  banking network failures, or other issues
                  originating from third-party payment systems.
                </p>

                <p>
                  If an amount is debited but your order is
                  not confirmed, contact our support team with
                  the transaction reference so that we can
                  investigate the issue.
                </p>
              </section>

              <section>
                <h2>8. Course Access and Digital Delivery</h2>

                <p>
                  Our courses and digital learning materials
                  are delivered electronically through the
                  ProPyCoder Platform.
                </p>

                <p>
                  Access is generally provided after successful
                  payment confirmation and is associated with
                  your registered account.
                </p>

                <p>
                  The duration, availability, and access
                  conditions applicable to a particular course
                  or bundle are described on its product page
                  or in the applicable purchase information.
                </p>

                <p>
                  {businessInfo.accessPolicy}
                </p>

                <p>
                  You are responsible for maintaining a
                  compatible device, internet connection,
                  browser, and software environment required
                  to access the Platform.
                </p>
              </section>

              <section>
                <h2>9. Licence and Permitted Use</h2>

                <p>
                  Upon successful purchase, you receive a
                  limited, non-exclusive, non-transferable
                  licence to access and use the purchased
                  educational content for your own personal
                  learning purposes, subject to the applicable
                  course conditions.
                </p>

                <p>
                  Unless expressly authorized in writing,
                  you must not:
                </p>

                <ul>
                  <li>Resell, sublicense, rent, or commercially distribute purchased courses.</li>
                  <li>Share login credentials or purchased course access with other individuals.</li>
                  <li>Upload course videos, PDFs, source materials, or other resources to public websites or file-sharing platforms.</li>
                  <li>Reproduce or redistribute educational materials without permission.</li>
                  <li>Use course materials to create or distribute unauthorized competing products.</li>
                  <li>Remove copyright notices, ownership information, or other intellectual property notices.</li>
                </ul>
              </section>

              <section>
                <h2>10. Intellectual Property Rights</h2>

                <p>
                  Unless otherwise stated, the Platform and
                  its original content, including text,
                  graphics, branding, logos, software,
                  website design, course materials, videos,
                  presentations, and other educational
                  resources, are owned by ProPyCoder or
                  their respective licensors.
                </p>

                <p>
                  These materials are protected under the
                  Copyright Act, 1957, the Trade Marks Act,
                  1999, and other applicable intellectual
                  property laws.
                </p>

                <p>
                  Purchasing a course does not transfer
                  ownership of its intellectual property
                  to you.
                </p>

                <p>
                  Unauthorized reproduction, modification,
                  distribution, publication, or commercial
                  exploitation may result in termination
                  of access and appropriate legal action.
                </p>
              </section>

              <section>
                <h2>11. User Conduct</h2>

                <p>
                  You agree to use the Platform lawfully
                  and responsibly.
                </p>

                <p>
                  You must not:
                </p>

                <ul>
                  <li>Attempt unauthorized access to the Platform, servers, or databases.</li>
                  <li>Interfere with the availability or security of the Platform.</li>
                  <li>Upload malicious software or harmful code.</li>
                  <li>Misuse another person's account or personal information.</li>
                  <li>Use the Platform for fraudulent, unlawful, or misleading activities.</li>
                  <li>Attempt to bypass payment, access-control, or course-protection mechanisms.</li>
                </ul>
              </section>

              <section>
                <h2>12. Platform Availability and Modifications</h2>

                <p>
                  We make reasonable efforts to maintain
                  the availability and functionality of
                  the Platform.
                </p>

                <p>
                  However, uninterrupted availability
                  cannot be guaranteed. Services may
                  occasionally be unavailable due to
                  maintenance, upgrades, technical issues,
                  network failures, or circumstances
                  beyond our reasonable control.
                </p>

                <p>
                  We may update or modify Platform features,
                  course content, and services when necessary.
                  Any material changes affecting purchased
                  services will be handled in accordance
                  with applicable law and relevant purchase
                  conditions.
                </p>
              </section>

              <section>
                <h2>13. Refunds and Cancellations</h2>

                <p>
                  Refund and cancellation requests are
                  governed exclusively by our{" "}
                  <Link href="/refund-policy">
                    Refund and Cancellation Policy
                  </Link>.
                </p>

                <p>
                  Please review that policy before
                  completing a purchase.
                </p>

                <p>
                  Nothing in these Terms excludes or
                  restricts any consumer right or remedy
                  that cannot legally be excluded under
                  applicable law.
                </p>
              </section>

              <section>
                <h2>14. Disclaimer of Warranties</h2>

                <p>
                  The Platform and its educational
                  materials are provided on an
                  "as available" basis, subject to
                  applicable law.
                </p>

                <p>
                  While we make reasonable efforts to
                  provide accurate and useful educational
                  content, we do not guarantee that
                  all materials will be error-free,
                  uninterrupted, or suitable for every
                  individual purpose.
                </p>

                <p>
                  You are responsible for evaluating
                  and applying the information provided
                  through the courses.
                </p>
              </section>

              <section>
                <h2>15. Limitation of Liability</h2>

                <p>
                  To the maximum extent permitted by
                  applicable law, ProPyCoder and its
                  representatives shall not be liable
                  for indirect, incidental, special,
                  consequential, or punitive damages
                  arising from your use of the Platform.
                </p>

                <p>
                  This includes, where legally permissible,
                  loss of profits, business opportunities,
                  data, goodwill, or other intangible losses.
                </p>

                <p>
                  Nothing in these Terms excludes or
                  limits liability that cannot lawfully
                  be excluded or limited under applicable
                  law, including applicable consumer
                  protection rights.
                </p>
              </section>

              <section>
                <h2>16. Indemnification</h2>

                <p>
                  To the extent permitted by applicable
                  law, you agree to indemnify and hold
                  harmless ProPyCoder and its
                  representatives against claims,
                  liabilities, losses, damages, and
                  reasonable expenses arising directly
                  from your unlawful use of the Platform,
                  infringement of third-party rights,
                  or material breach of these Terms.
                </p>
              </section>

              <section>
                <h2>17. Suspension and Termination</h2>

                <p>
                  We may suspend or terminate access to
                  the Platform or a purchased service
                  where reasonably necessary due to
                  violations of these Terms, fraudulent
                  activity, unauthorized distribution
                  of materials, or security concerns.
                </p>

                <p>
                  Where appropriate, we may provide
                  notice and an opportunity to resolve
                  the issue before restricting access.
                </p>

                <p>
                  Termination does not affect rights
                  or obligations that accrued before
                  termination or provisions that are
                  intended to continue afterward,
                  including intellectual property,
                  liability, and indemnification.
                </p>
              </section>

              <section>
                <h2>18. Third-Party Websites and Services</h2>

                <p>
                  The Platform may contain links to
                  third-party websites, tools, software,
                  or services.
                </p>

                <p>
                  These third-party services operate
                  independently and are governed by
                  their own terms and privacy policies.
                </p>

                <p>
                  ProPyCoder does not control or
                  guarantee the availability, content,
                  security, or practices of external
                  services.
                </p>
              </section>

              <section>
                <h2>19. Governing Law and Jurisdiction</h2>

                <p>
                  These Terms are governed by the
                  laws of India, subject to mandatory
                  consumer protection provisions
                  applicable to you.
                </p>

                <p>
                  Disputes relating to the Platform
                  or these Terms shall be subject
                  to the jurisdiction of competent
                  courts in India, as determined
                  under applicable law.
                </p>

                <p>
                  If you are a consumer residing
                  outside India, mandatory consumer
                  protection rights available under
                  the laws of your country of
                  residence remain unaffected
                  where those rights cannot legally
                  be excluded.
                </p>
              </section>

              <section>
                <h2>20. Language</h2>

                <p>
                  These Terms are prepared in English.
                  Any translation is provided for
                  convenience. In case of inconsistency,
                  the English version will prevail
                  to the extent permitted by law.
                </p>
              </section>

              <section>
                <h2>21. Changes to These Terms</h2>

                <p>
                  We may revise these Terms from time
                  to time to reflect changes in our
                  services, business practices, or
                  applicable legal requirements.
                </p>

                <p>
                  Updated versions will be published
                  on this page with a revised update
                  date.
                </p>

                <p>
                  Material changes will be communicated
                  where required by applicable law.
                </p>
              </section>

              <section>
                <h2>22. Contact</h2>

                {/* <p>
                  If you have questions regarding
                  these Terms, please contact us
                  through our{" "}
                  <Link href="/contact">
                    Contact and Support
                  </Link>{" "}
                  page.
                </p> */}
                  <p>
                  If you have questions regarding
                  these Terms, please contact:</p><p>
                  Email:{" "}
                  <a href={`mailto:${supportEmail}`}>
                    {supportEmail}
                  </a>
                </p>

                <p>
                  Phone:{" "}
                  <a href={`tel:${supportPhone}`}>
                    {supportPhone}
                  </a>
                </p>
              </section>
            </>
          )}

          {/* ================================================== */}
          {/* PRIVACY POLICY */}
          {/* ================================================== */}

          {kind === "privacy" && (
            <>
              <section>
                <h2>1. Introduction</h2>

                <p>
                  ProPyCoder respects your privacy
                  and is committed to handling
                  personal information responsibly.
                </p>

                <p>
                  This Privacy Policy explains what
                  information we collect, why we
                  collect it, how we use and share
                  it, how long we retain it, and
                  the choices and rights available
                  to you.
                </p>

                <p>
                  This policy applies to visitors,
                  registered users, students, and
                  customers using our website and
                  educational services.
                </p>
              </section>

              <section>
                <h2>2. Information We Collect</h2>

                <h3>2.1 Information You Provide</h3>

                <p>
                  Depending on how you use the
                  Platform, we may collect:
                </p>

                <ul>
                  <li>Name and account profile information.</li>
                  <li>Email address and phone number.</li>
                  <li>Account login credentials.</li>
                  <li>Course enrollment and purchase details.</li>
                  <li>Payment references and transaction status.</li>
                  <li>Course progress, quiz activity, and assessment records.</li>
                  <li>Certificate and completion information.</li>
                  <li>Messages, feedback, and support requests.</li>
                </ul>

                <h3>2.2 Automatically Collected Information</h3>

                <p>
                  When you access the Platform,
                  certain technical information
                  may be collected automatically,
                  including:
                </p>

                <ul>
                  <li>IP address and approximate location.</li>
                  <li>Browser type and version.</li>
                  <li>Device type and operating system.</li>
                  <li>Pages visited and interactions with the Platform.</li>
                  <li>Login sessions and access records.</li>
                  <li>Course and download activity.</li>
                </ul>
              </section>

              <section>
                <h2>3. Account Credentials</h2>

                <p>
                  Your account password is stored
                  in a protected, hashed form
                  rather than as readable plain text.
                </p>

                <p>
                  You should not share your password
                  or other authentication credentials
                  with anyone.
                </p>

                <p>
                  We will never ask you to disclose
                  your UPI PIN, card security code,
                  or online banking password.
                </p>
              </section>

              <section>
                <h2>4. Payment Information</h2>

                <p>
                  Payments are processed through
                  PhonePe or another payment provider
                  presented during checkout.
                </p>

                <p>
                  We do not intentionally collect
                  or store full card numbers,
                  card security codes, UPI PINs,
                  or online banking passwords.
                </p>

                <p>
                  We may receive and retain
                  transaction references,
                  payment amounts, order details,
                  payment method information,
                  and payment confirmation status
                  to verify transactions and
                  provide purchased services.
                </p>

                <p>
                  Payment providers process
                  payment information under
                  their own privacy policies
                  and security procedures.
                </p>
              </section>

              <section>
                <h2>5. How We Use Your Information</h2>

                <p>
                  We use personal information
                  for purposes including:
                </p>

                <ul>
                  <li>Creating and managing user accounts.</li>
                  <li>Providing access to courses and purchased content.</li>
                  <li>Recording course progress and completion.</li>
                  <li>Generating and verifying certificates.</li>
                  <li>Processing and reconciling payments.</li>
                  <li>Sending order confirmations and service-related notifications.</li>
                  <li>Responding to customer support requests.</li>
                  <li>Maintaining platform security and preventing fraud.</li>
                  <li>Improving our educational services and platform functionality.</li>
                  <li>Maintaining financial, accounting, and legal records.</li>
                  <li>Complying with applicable legal obligations.</li>
                </ul>
              </section>

              <section>
                <h2>6. Legal Basis and Consent</h2>

                <p>
                  We process personal information
                  as permitted under applicable
                  data protection laws.
                </p>

                <p>
                  Depending on the purpose and
                  applicable jurisdiction,
                  processing may be necessary
                  to:
                </p>

                <ul>
                  <li>Provide services you request or purchase.</li>
                  <li>Fulfil contractual obligations.</li>
                  <li>Comply with applicable legal requirements.</li>
                  <li>Protect the security and integrity of the Platform.</li>
                  <li>Pursue legitimate operational interests where legally permitted.</li>
                  <li>Carry out activities based on your consent where required.</li>
                </ul>

                <p>
                  Where consent is required,
                  you may withdraw it subject
                  to applicable law. Withdrawal
                  does not affect processing
                  lawfully carried out before
                  the withdrawal.
                </p>
              </section>

              <section>
                <h2>7. Cookies and Browser Storage</h2>

                <p>
                  The Platform may use cookies,
                  session identifiers, and
                  browser storage to support
                  authentication, security,
                  preferences, and website
                  functionality.
                </p>

                <p>
                  These technologies may be
                  used for:
                </p>

                <ul>
                  <li>Maintaining login sessions.</li>
                  <li>Protecting account security.</li>
                  <li>Remembering display preferences such as theme settings.</li>
                  <li>Maintaining necessary website functionality.</li>
                </ul>

                <p>
                  You can manage or delete cookies
                  through your browser settings.
                  Disabling necessary cookies or
                  browser storage may affect
                  sign-in and certain Platform
                  features.
                </p>

                <p>
                  If analytics or marketing
                  technologies are introduced,
                  appropriate disclosures and
                  consent controls will be
                  provided where required
                  by applicable law.
                </p>
              </section>

              <section>
                <h2>8. Sharing of Personal Information</h2>

                <p>
                  We may share information
                  with service providers when
                  necessary to operate the
                  Platform and provide our
                  services.
                </p>

                <p>
                  These may include:
                </p>

                <ul>
                  <li>Payment providers for processing transactions.</li>
                  <li>Website hosting and infrastructure providers.</li>
                  <li>Database and authentication service providers.</li>
                  <li>Email and communication service providers.</li>
                  <li>Technical service providers supporting platform operations.</li>
                  <li>Professional advisers and government authorities where legally required.</li>
                </ul>

                <p>
                  Service providers may process
                  information on our behalf
                  according to their applicable
                  agreements and privacy practices.
                </p>

                <p>
                  We do not sell or rent your
                  personal information to
                  third parties.
                </p>

                <p>
                  We do not intentionally
                  disclose customer information
                  to third parties for their
                  independent marketing purposes.
                </p>
              </section>

              <section>
                <h2>9. International Data Processing</h2>

                <p>
                  ProPyCoder operates from India
                  and may use third-party service
                  providers whose infrastructure
                  or processing facilities are
                  located in other countries.
                </p>

                <p>
                  As a result, personal
                  information may be processed
                  outside your country of
                  residence, subject to
                  applicable legal requirements
                  and safeguards.
                </p>

                <p>
                  We take reasonable steps
                  to ensure that service
                  providers handle information
                  appropriately.
                </p>
              </section>

              <section>
                <h2>10. Data Retention</h2>

                <p>
                  We retain personal information
                  only for as long as reasonably
                  necessary for the purposes
                  described in this policy,
                  subject to applicable legal
                  requirements.
                </p>

                <p>
                  Retention may depend on
                  the type of information:
                </p>

                <ul>
                  <li>Account information: while your account remains active or as otherwise necessary.</li>
                  <li>Course and learning records: while required to provide course services and maintain relevant records.</li>
                  <li>Transaction records: as required for accounting, taxation, and legal purposes.</li>
                  <li>Support correspondence: for the period reasonably necessary to resolve requests and maintain relevant records.</li>
                  <li>Marketing information: until consent is withdrawn or you unsubscribe, where applicable.</li>
                </ul>

                <p>
                  When information is no longer
                  required, we will take
                  reasonable steps to delete
                  or anonymise it, subject
                  to lawful retention
                  requirements.
                </p>
              </section>

              <section>
                <h2>11. Data Security</h2>

                <p>
                  We use reasonable technical
                  and organisational measures
                  designed to protect personal
                  information against
                  unauthorized access,
                  disclosure, alteration,
                  and destruction.
                </p>

                <p>
                  These measures may include
                  access controls, protected
                  password storage, secure
                  connections, and appropriate
                  operational safeguards.
                </p>

                <p>
                  However, no internet
                  transmission or electronic
                  storage method can be
                  guaranteed to be completely
                  secure.
                </p>
              </section>

              <section>
                <h2>12. Your Privacy Rights</h2>

                <p>
                  Subject to applicable law,
                  you may have the right to:
                </p>

                <ul>
                  <li>Request information about personal data we process.</li>
                  <li>Request correction of inaccurate or incomplete information.</li>
                  <li>Request deletion of personal information where legally permitted.</li>
                  <li>Withdraw consent where processing is based on consent.</li>
                  <li>Request information about how your personal data is handled.</li>
                  <li>Raise privacy-related complaints or grievances.</li>
                </ul>

                <p>
                  Additional rights may be
                  available depending on your
                  country of residence and
                  the applicable data protection
                  legislation.
                </p>

                <p>
                  These rights are subject
                  to legal exceptions,
                  including records that
                  we are required to retain
                  under applicable law.
                </p>
              </section>

              <section>
                <h2>13. Account Deletion</h2>

                <p>
                  You may contact us to
                  request deletion of your
                  account and associated
                  personal information.
                </p>

                <p>
                  Before processing a request,
                  we may ask you to verify
                  your identity.
                </p>

                <p>
                  Please note that deleting
                  an account may result in
                  loss of access to purchased
                  courses, learning progress,
                  certificates, and other
                  account-associated services.
                </p>

                <p>
                  Certain transaction,
                  accounting, or legally
                  required records may need
                  to be retained even after
                  account deletion.
                </p>
              </section>

              <section>
                <h2>14. Marketing Communications</h2>

                <p>
                  We may send promotional
                  communications where
                  permitted by applicable
                  law and based on the
                  required consent or
                  other lawful basis.
                </p>

                <p>
                  You may unsubscribe from
                  marketing communications
                  or withdraw consent where
                  applicable.
                </p>

                <p>
                  Transactional messages,
                  including payment
                  confirmations, course
                  access information,
                  account notifications,
                  and support responses,
                  may continue where
                  necessary to provide
                  our services.
                </p>
              </section>

              <section>
                <h2>15. Children's Privacy</h2>

                <p>
                  Our Platform is intended
                  for individuals who are
                  legally permitted to
                  use our services.
                </p>

                <p>
                  Where applicable law
                  requires parental or
                  guardian consent for
                  minors, such requirements
                  must be satisfied before
                  personal information
                  is processed.
                </p>

                <p>
                  If you believe that
                  personal information
                  has been provided in
                  violation of applicable
                  age-related requirements,
                  please contact us.
                </p>
              </section>

              <section>
                <h2>16. Third-Party Websites</h2>

                <p>
                  Our Platform may contain
                  links to external websites
                  or third-party services.
                </p>

                <p>
                  We are not responsible
                  for their privacy practices,
                  content, or security.
                  Please review their
                  respective privacy policies
                  before sharing personal
                  information.
                </p>
              </section>

              <section>
                <h2>17. Data Breaches and Security Incidents</h2>

                <p>
                  If we become aware of a
                  personal data breach,
                  we will investigate
                  the incident and take
                  reasonable steps to
                  contain and address it.
                </p>

                <p>
                  Notifications to affected
                  individuals and relevant
                  authorities will be made
                  where and when required
                  by applicable law.
                </p>
              </section>

              <section>
                <h2>18. Privacy Grievances and Requests</h2>

                <p>
                  For privacy-related
                  questions, access requests,
                  correction requests,
                  deletion requests, or
                  complaints, contact us
                  using the details on
                  our{" "}
                  <Link href="/contact">
                    Contact and Support
                  </Link>{" "}
                  page.
                </p>

                <p>
                  We may request additional
                  information to verify
                  your identity and understand
                  your request.
                </p>

                <p>
                  We will handle privacy
                  requests within the
                  timeframes required
                  by applicable law.
                </p>
              </section>

              <section>
                <h2>19. Changes to This Privacy Policy</h2>

                <p>
                  We may update this Privacy
                  Policy to reflect changes
                  in our services, information
                  practices, or legal
                  requirements.
                </p>

                <p>
                  The updated version
                  will be published on
                  this page with a revised
                  update date.
                </p>
              </section>

              <section>
                <h2>20. Contact</h2>

                <p>
                  For questions or concerns
                  regarding this Privacy
                  Policy, contact:
                </p>

                <p>
                  Email:{" "}
                  <a href={`mailto:${supportEmail}`}>
                    {supportEmail}
                  </a>
                </p>

                <p>
                  Phone:{" "}
                  <a href={`tel:${supportPhone}`}>
                    {supportPhone}
                  </a>
                </p>
              </section>
            </>
          )}

          {/* ================================================== */}
          {/* REFUND AND CANCELLATION POLICY */}
          {/* ================================================== */}

          {kind === "refund" && (
            <>
              <section>
                <h2>1. Introduction</h2>

                <p>
                  ProPyCoder provides digital
                  educational products,
                  including online courses,
                  course bundles, recorded
                  sessions, and downloadable
                  learning materials.
                </p>

                <p>
                  This policy explains
                  the conditions under
                  which cancellations
                  and refunds may be
                  requested.
                </p>

                <p>
                  By completing a purchase,
                  you acknowledge that
                  you have reviewed the
                  relevant course description,
                  price, and applicable
                  purchase conditions.
                </p>
              </section>

              <section>
                <h2>2. Digital Product Delivery</h2>

                <p>
                  Our courses and bundles
                  are delivered electronically
                  through the ProPyCoder
                  learning platform.
                </p>

                <p>
                  Access is generally
                  provided after successful
                  payment confirmation.
                </p>

                <p>
                  Since digital products
                  may become accessible
                  immediately after purchase,
                  cancellation and refund
                  eligibility is subject
                  to this policy and
                  applicable consumer
                  protection laws.
                </p>
              </section>

              <section>
                <h2>3. Cancellation Requests</h2>

                <p>
                  Once payment is completed
                  and digital access has
                  been granted, ordinary
                  cancellation requests
                  may not be accepted.
                </p>

                <p>
                  However, if payment
                  has been completed but
                  the purchased service
                  has not been delivered,
                  you may contact our
                  support team to request
                  cancellation or resolution.
                </p>

                <p>
                  Any statutory cancellation
                  or withdrawal rights
                  that cannot legally
                  be excluded will remain
                  unaffected.
                </p>
              </section>

              <section>
                <h2>4. Eligible Refund Situations</h2>

                <p>
                  A full refund may be
                  issued in the following
                  circumstances:
                </p>

                <ul>
                  <li>
                    <strong>Duplicate payment:</strong>{" "}
                    You were charged more than
                    once for the same order.
                  </li>

                  <li>
                    <strong>Payment deducted but access not provided:</strong>{" "}
                    Your payment was successfully
                    debited, but the purchased
                    course or bundle was not
                    delivered and the issue
                    cannot be resolved.
                  </li>

                  <li>
                    <strong>Incorrect product delivered:</strong>{" "}
                    You received a different
                    product from the one
                    purchased and the correct
                    product cannot be provided.
                  </li>

                  <li>
                    <strong>Unresolved technical failure:</strong>{" "}
                    You cannot access the
                    purchased product because
                    of a technical fault
                    attributable to ProPyCoder,
                    and our support team
                    cannot resolve the issue
                    within 7 business days
                    after your first report.
                  </li>

                  <li>
                    <strong>Other legally required circumstances:</strong>{" "}
                    A refund or other remedy
                    is required under applicable
                    consumer protection law.
                  </li>
                </ul>
              </section>

              <section>
                <h2>5. Situations Generally Not Eligible for Refund</h2>

                <p>
                  Subject to applicable
                  statutory rights, refunds
                  will generally not be
                  issued for:
                </p>

                <ul>
                  <li>Change of mind after purchase or access to digital content.</li>
                  <li>Failure to complete or participate in a purchased course.</li>
                  <li>Dissatisfaction arising solely from personal expectations.</li>
                  <li>Lack of prerequisite knowledge or skills disclosed on the course page.</li>
                  <li>Device, browser, or software incompatibility where relevant requirements were disclosed before purchase.</li>
                  <li>Inability to access content due to the customer's internet connection or personal device issues.</li>
                  <li>Requests submitted outside the applicable refund request period, where no mandatory legal right applies.</li>
                </ul>

                <p>
                  Nothing in this section
                  excludes refunds or remedies
                  required by applicable law.
                </p>
              </section>

              <section>
                <h2>6. Refund Request Period</h2>

                <p>
                  Unless a different period
                  is required by applicable
                  law, customers should
                  submit refund requests
                  within 7 days of the
                  purchase date.
                </p>

                <p>
                  Requests submitted after
                  this period may not be
                  eligible under our
                  voluntary refund policy.
                </p>

                <p>
                  Mandatory statutory
                  consumer rights remain
                  unaffected.
                </p>
              </section>

              <section>
                <h2>7. Technical Problems and Course Access</h2>

                <p>
                  If you experience a
                  technical problem,
                  please contact our
                  support team before
                  submitting a refund
                  request.
                </p>

                <p>
                  We will make reasonable
                  efforts to investigate
                  and resolve issues
                  involving:
                </p>

                <ul>
                  <li>Missing course access.</li>
                  <li>Incorrect enrollment.</li>
                  <li>Download failures.</li>
                  <li>Payment confirmation problems.</li>
                  <li>Technical errors affecting purchased content.</li>
                </ul>

                <p>
                  Where a technical issue
                  is attributable to us
                  and cannot reasonably
                  be resolved within
                  the applicable period,
                  a refund or another
                  appropriate remedy
                  may be provided.
                </p>
              </section>

              <section>
                <h2>8. How to Request a Refund</h2>

                <p>
                  To request a refund,
                  email us at{" "}
                  <a href={`mailto:${supportEmail}`}>
                    {supportEmail}
                  </a>.
                </p>

                <p>
                  Please include:
                </p>

                <ul>
                  <li>Your order or transaction reference.</li>
                  <li>Your registered email address.</li>
                  <li>The name of the purchased course or bundle.</li>
                  <li>The reason for requesting a refund.</li>
                  <li>Relevant screenshots or error messages, if applicable.</li>
                </ul>

                <p>
                  We may request additional
                  information where necessary
                  to verify the transaction
                  and investigate the issue.
                </p>
              </section>

              <section>
                <h2>9. Refund Processing</h2>

                <p>
                  Approved refunds will
                  generally be initiated
                  within 7 business days
                  after approval.
                </p>

                <p>
                  Refunds will ordinarily
                  be processed through
                  the original payment
                  method where supported
                  by the payment provider.
                </p>

                <p>
                  The time required for
                  the refunded amount
                  to appear in your bank
                  account or payment method
                  depends on the payment
                  provider and financial
                  institution.
                </p>
              </section>

              <section>
                <h2>10. Duplicate and Failed Transactions</h2>

                <p>
                  If an amount is debited
                  but your order is not
                  confirmed, please
                  contact us with your
                  payment reference.
                </p>

                <p>
                  We will verify the
                  transaction and
                  investigate whether
                  the payment was
                  successfully received.
                </p>

                <p>
                  Duplicate successful
                  payments will be
                  reviewed for refund.
                </p>
              </section>

              <section>
                <h2>11. Chargebacks and Payment Disputes</h2>

                <p>
                  If you believe a
                  payment is incorrect
                  or unauthorized,
                  please contact us
                  so that we can
                  investigate.
                </p>

                <p>
                  You may also contact
                  your bank or payment
                  provider to exercise
                  any applicable dispute
                  or chargeback rights.
                </p>

                <p>
                  We do not restrict
                  customers from exercising
                  legitimate payment
                  dispute rights.
                </p>

                <p>
                  Where a transaction
                  is disputed or suspected
                  to be fraudulent,
                  access to the relevant
                  purchased service
                  may be temporarily
                  reviewed while the
                  matter is investigated,
                  subject to applicable law.
                </p>
              </section>

              <section>
                <h2>12. Refunds and Digital Access</h2>

                <p>
                  Where a refund is
                  approved, the licence
                  associated with the
                  refunded digital
                  product may be
                  terminated and
                  access to that
                  product may be
                  withdrawn.
                </p>

                <p>
                  Customers must not
                  continue using or
                  distributing refunded
                  course materials
                  after the relevant
                  access rights have
                  ended.
                </p>
              </section>

              <section>
                <h2>13. Consumer Protection Rights</h2>

                <p>
                  This policy does not
                  exclude or limit any
                  mandatory consumer
                  rights or remedies
                  available under
                  applicable law.
                </p>

                <p>
                  Customers residing
                  outside India may
                  have additional
                  statutory rights
                  under the laws
                  of their country
                  of residence.
                </p>

                <p>
                  Where a mandatory
                  legal right conflicts
                  with this policy,
                  the applicable law
                  will prevail.
                </p>
              </section>

              <section>
                <h2>14. Changes to This Policy</h2>

                <p>
                  ProPyCoder may update
                  this policy from time
                  to time.
                </p>

                <p>
                  The latest version
                  will be published
                  on this page with
                  its revised update
                  date.
                </p>
              </section>

              <section>
                <h2>15. Contact</h2>

                <p>
                  For refund and
                  cancellation assistance,
                  contact:
                </p>

                <p>
                  Email:{" "}
                  <a href={`mailto:${supportEmail}`}>
                    {supportEmail}
                  </a>
                </p>

                <p>
                  Phone:{" "}
                  <a href={`tel:${supportPhone}`}>
                    {supportPhone}
                  </a>
                </p>
              </section>
            </>
          )}

          {/* ================================================== */}
          {/* CONTACT AND SUPPORT */}
          {/* ================================================== */}

          {kind === "contact" && (
            <>
              <section>
                <h2>1. Account and Course Support</h2>

                <p>
                  Contact us if you need
                  assistance with:
                </p>

                <ul>
                  <li>Account registration and login.</li>
                  <li>Course enrollment and access.</li>
                  <li>Purchased course bundles.</li>
                  <li>Learning progress and certificates.</li>
                  <li>Technical problems with the Platform.</li>
                </ul>
              </section>

              <section>
                <h2>2. Payment and Refund Support</h2>

                <p>
                  For payment-related
                  issues, please provide
                  your registered email
                  address and transaction
                  or order reference.
                </p>

                <p>
                  For refund requests,
                  please refer to our{" "}
                  <Link href="/refund-policy">
                    Refund and Cancellation Policy
                  </Link>.
                </p>

                <p>
                  Never share your
                  password, UPI PIN,
                  full card details,
                  or card security
                  code with our
                  support team.
                </p>
              </section>

              <section>
                <h2>3. Privacy and Data Requests</h2>

                <p>
                  You may contact us
                  to request information
                  about your personal
                  data, correct inaccurate
                  information, request
                  deletion where legally
                  permitted, or raise
                  a privacy complaint.
                </p>

                <p>
                  Please review our{" "}
                  <Link href="/privacy-policy">
                    Privacy Policy
                  </Link>{" "}
                  for further information.
                </p>
              </section>

              <section>
                <h2>4. Support Response</h2>

                <p>
                  We aim to acknowledge
                  and respond to support
                  requests as soon as
                  reasonably practicable.
                </p>

                <p>
                  Response and resolution
                  times may vary depending
                  on the nature and
                  complexity of the
                  request.
                </p>
              </section>
              
               <section>
                <h2>5. Contact</h2>

                <p>
                  Legal Operator: {businessInfo.legalName}
                </p>

                <p>
                  Business Address: {businessInfo.businessAddress}
                </p>

                <p>
                  Email:{" "}
                  <a href={`mailto:${supportEmail}`}>
                    {supportEmail}
                  </a>
                </p>

                <p>
                  Phone:{" "}
                  <a href={`tel:${supportPhone}`}>
                    {supportPhone}
                  </a>
                </p>
              </section>
            </>
          )}

        </div>
      </article>

      {/* FOOTER */}

      <footer className="home-footer">
        <Link href="/" className="home-footer-brand">
          <BrandLogo size={27} />
          ProPyCoder
        </Link>

        <span>
          Learn something real. Build something useful.
        </span>

        <div>
          <Link href="/about">About</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy-policy">Privacy</Link>
          <Link href="/refund-policy">Refunds</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </footer>
    </main>
  );
}
