import Link from "next/link";
import { ArrowRight, BookOpen, Code2, GraduationCap } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { BrandLogo } from "@/components/brand-logo";
import { businessInfo } from "@/lib/business-info";

export const metadata = {
  title: "About Us | ProPyCoder",
  description:
    "Learn about ProPyCoder, an online learning platform for practical software and coding education.",
};

const focusAreas = [
  {
    icon: BookOpen,
    title: "Structured courses",
    description:
      "Explore online courses organized into lessons and modules, with course details and pricing shown before purchase.",
  },
  {
    icon: Code2,
    title: "Practice while learning",
    description:
      "Use the PyCoder learning lab and course activities to put programming concepts into practice.",
  },
  {
    icon: GraduationCap,
    title: "Track your learning",
    description:
      "A learner account brings course access and learning progress together in one place.",
  },
];

export default function AboutPage() {
  return (
    <main className="site-home about-page">
      <Navbar />
      <section className="about-hero">
        <div className="about-hero-inner">
          <div className="home-section-eyebrow">ABOUT PRO PYCODER</div>
          <h1>Learn by <em>building.</em></h1>
          <p>
            Practical, project-led learning for people ready to build what&apos;s
            next. ProPyCoder brings software courses, coding practice, and
            learner progress together in one place.
          </p>
          <div className="about-actions">
            <Link href="/courses" className="home-primary-button">
              Explore courses <ArrowRight size={16} />
            </Link>
            <Link href="/contact" className="about-contact-link">Contact support</Link>
          </div>
        </div>
        <div className="about-hero-mark" aria-hidden="true">
          <Code2 size={58} strokeWidth={1.2} />
        </div>
      </section>

      <section className="about-main-section">
        <div className="about-section-heading">
          <div className="home-section-eyebrow">THE LEARNING EXPERIENCE</div>
          <h2>Learn a concept. <em>Put it to work.</em></h2>
          <p>Tools and learning materials designed to support your practice.</p>
        </div>
        <div className="about-focus-grid">
          {focusAreas.map(({ icon: Icon, title, description }, index) => (
            <article className="about-focus-card" key={title}>
              <div className="about-focus-icon"><Icon size={21} aria-hidden="true" /></div>
              <span className="about-focus-number">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-approach-section">
        <div className="about-approach-label">
          <div className="home-section-eyebrow">OUR APPROACH</div>
          <h2>Clear details.<br /><em>Hands-on practice.</em></h2>
        </div>
        <div className="about-approach-copy">
          <p>
            Course pages describe the subject, level, instructor, estimated
            duration, and price, so you can review what is included before
            enrolling. Some courses may include free preview material; its
            availability is shown on the course page.
          </p>
          <p>
            ProPyCoder is a learning resource, not a promise of employment,
            certification, or a particular learning outcome. Results depend on
            each learner&apos;s goals, practice, and circumstances.
          </p>
        </div>
      </section>

      <section className="about-contact-section">
        <div>
          <div className="home-section-eyebrow">HERE TO HELP</div>
          <h2>Questions? <em>Talk to us.</em></h2>
          <p>ProPyCoder · {businessInfo.businessAddress}</p>
        </div>
        <div className="about-contact-details">
          <a href={`mailto:${businessInfo.supportEmail}`}>{businessInfo.supportEmail}</a>
          <a href={`tel:${businessInfo.supportPhone}`}>{businessInfo.supportPhone}</a>
        </div>
      </section>

      <footer className="home-footer">
        <Link href="/" className="home-footer-brand">
          <BrandLogo size={27} />
          ProPyCoder
        </Link>
        <span>Learn something real. Build something useful.</span>
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