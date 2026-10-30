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

export function PolicyPage({ kind }: { kind: PolicyKind }) {
  return (
    <main className="policy-page">
      <Navbar />
      <article className="policy-content">
        <Link href="/" className="policy-back">← Back to ProPyCoder</Link>
        <p className="policy-eyebrow">PRO PYCODER · WEBSITE POLICIES</p>
        <h1>{titles[kind]}</h1>
        <p className="policy-updated">Review these terms before purchasing. Last updated: October 30, 2026.</p>

        {/* <section>
          <h2>Business operator</h2>
          <p>Website and learning platform: ProPyCoder.</p>
          <p>Business/operator name: {businessInfo.legalName}</p>
          <p>Business location: {businessInfo.businessAddress}</p>
          <p>Support email: <a href={`mailto:${businessInfo.supportEmail}`}>{businessInfo.supportEmail}</a></p>
          <p>Support phone: <a href={`tel:${businessInfo.supportPhone}`}>{businessInfo.supportPhone}</a></p>
        </section> */}

        {kind === "terms" && <>
          <section><h2>Courses and orders</h2><p>ProPyCoder offers online educational courses and related learning services. The course page describes the course content, level, instructor, estimated duration, and price. Please review that information before ordering. An order is accepted for processing after you submit it; course access is granted after successful payment confirmation.</p></section>
          <section><h2>Price and payment</h2><p>Prices are displayed in Indian rupees (INR). Any applicable discount and the amount payable are shown before you continue to the payment provider. Payments are processed by PhonePe or another payment provider presented at checkout and are subject to that provider&apos;s terms and your bank or payment method&apos;s rules. ProPyCoder records order and payment status to provide access and customer support; do not send card security codes, passwords, or UPI PINs to us.</p></section>
          <section><h2>Course access</h2><p>{businessInfo.accessPolicy}</p></section>
          <section><h2>Your account</h2><p>You are responsible for providing accurate account information, keeping your sign-in credentials confidential, and activity under your account. Notify us promptly if you suspect unauthorized use. We may restrict or suspend access where reasonably necessary to protect the service, other users, or our legal rights, or to address misuse.</p></section>
          <section><h2>Permitted use and course materials</h2><p>Use the platform for personal learning and lawful purposes. Do not attempt to disrupt, probe, or gain unauthorized access to the platform; misuse another person&apos;s account; or copy, resell, publicly distribute, or commercially exploit course materials without the rights holder&apos;s permission. Rights in course content remain with their respective owners.</p></section>
          <section><h2>Availability and changes</h2><p>We work to keep the platform and courses available, but online services may occasionally be interrupted for maintenance, updates, or circumstances outside our control. Course details and platform features may change; material changes to a purchased course will be handled in accordance with applicable law.</p></section>
          <section><h2>Refunds, liability, and contact</h2><p>Refund and cancellation requests are handled according to our <Link href="/refund-policy">Refund and Cancellation Policy</Link>. Nothing in these terms excludes rights or remedies that cannot be excluded under applicable law. To contact us, use the details on our <Link href="/contact">Contact and Support</Link> page.</p></section>
        </>}

        {kind === "privacy" && <>
          <section><h2>Information we collect</h2><p>When you register, we collect the name, email address, and password you provide; passwords are stored in a protected, hashed form rather than as readable text. To provide the learning service, we process enrollments, course progress, quiz activity, certificates, and account settings associated with your account. When you make a purchase, we maintain order details such as the course or bundle, amount, payment status, payment method, and provider transaction references.</p></section>
          <section><h2>Payment information</h2><p>Checkout is handled by PhonePe or the payment provider shown to you. We do not request or store your full card number, card security code, UPI PIN, or online banking password. The provider may collect and process payment information under its own privacy terms.</p></section>
          <section><h2>How we use information</h2><p>We use information to create and secure accounts, provide course access, save learning progress, issue and verify certificates, process and reconcile orders, respond to support requests, improve platform reliability, and meet legal obligations.</p></section>
          <section><h2>Cookies and device storage</h2><p>The site uses authentication/session cookies needed to sign in and maintain account security. It may store your display preference, such as the selected color theme, in your browser. Your browser settings can control cookies and local storage, but disabling necessary storage may prevent sign-in or some features from working.</p></section>
          <section><h2>Sharing and service providers</h2><p>We share only information needed to operate the service with providers such as our payment gateway, hosting and database providers, and authentication infrastructure. We may disclose information when required by law or when reasonably necessary to protect users, the service, or legal rights. We do not sell personal information.</p></section>
          <section><h2>Retention and security</h2><p>We keep account, learning, and transaction records while needed to provide the service, resolve disputes, maintain business records, and comply with applicable law. Retention periods can vary by record type. We use reasonable administrative and technical safeguards, including password hashing and access controls; no online service can guarantee absolute security.</p></section>
          <section><h2>Your choices and requests</h2><p>You may update certain account details through your profile. To ask about, correct, or request deletion of personal information, contact us using the details on our <Link href="/contact">Contact and Support</Link> page. We may need to verify your identity and may retain records where required for legitimate or legal purposes.</p></section>
          <section><h2>Policy updates</h2><p>We may update this notice when our information practices or applicable requirements change. The latest version and its update date will be published on this page. If you have a privacy question or request, contact us using the details above.</p></section>
        </>}

        {kind === "refund" && <>
          <section><h2>Digital course purchases</h2><p>Courses and bundles are digital products delivered through the ProPyCoder learning platform. Please review the course description, included content, and price before placing an order. Successful payment normally enables access through the account used for purchase.</p></section>
          <section><h2>Refund and cancellation terms</h2><p>{businessInfo.refundPolicy}</p><p>Nothing in this policy limits rights or remedies that cannot be excluded under applicable law. If a refund is approved or legally required, it will be initiated to the original payment method where supported; the payment provider or bank may take additional time to post it.</p></section>
          <section><h2>Payment issues and access problems</h2><p>If you were charged but course access was not provided, a payment appears duplicated, or an order failed despite a debit, contact support with your account email and order/payment reference. We will check the transaction and help resolve an incorrect charge or missing access. Never send a password, card security code, or UPI PIN.</p></section>
          <section><h2>How to request help</h2><p>Email <a href={`mailto:${businessInfo.supportEmail}`}>{businessInfo.supportEmail}</a> or call <a href={`tel:${businessInfo.supportPhone}`}>{businessInfo.supportPhone}</a>. Include the course or bundle name and transaction reference where available.</p></section>
        </>}

        {kind === "contact" && <>
          <section><h2>Business and support details</h2><p>Operator: {businessInfo.legalName}</p><p>Location: {businessInfo.businessAddress}.</p><p>Email: <a href={`mailto:${businessInfo.supportEmail}`}>{businessInfo.supportEmail}</a></p><p>Phone: <a href={`tel:${businessInfo.supportPhone}`}>{businessInfo.supportPhone}</a></p><p>Contact us by email or phone for account, course, payment, privacy, or refund questions. We review support requests and respond as soon as practicable.</p></section>
          <section><h2>For payment or course-access issues</h2><p>Include your account email, course or bundle name, and payment/order reference if available so we can investigate. Do not send passwords, full card details, card security codes, or UPI PINs.</p></section>
        </>}

      </article>
      <footer className="home-footer">
        <Link href="/" className="home-footer-brand">
          <BrandLogo size={27} />
          ProPyCoder
        </Link>
        <span>Learn something real. Build something useful.</span>
        <div>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy-policy">Privacy</Link>
          <Link href="/refund-policy">Refunds</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </footer>
    </main>
  );
}