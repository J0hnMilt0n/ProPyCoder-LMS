import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Code2,
  GraduationCap,
  Play,
  Sparkles,
  Terminal,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { BrandLogo } from "@/components/brand-logo";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [courses, studentCount, enrollmentCount] = await Promise.all([
    prisma.course.findMany({
      where: { status: "PUBLISHED" },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        level: true,
        duration: true,
        image: true,
        price: true,
        instructor: { select: { firstName: true, lastName: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    prisma.user.count({ where: { role: "STUDENT", isActive: true } }),
    prisma.enrollment.count(),
  ]);

  return (
    <main className="site-home">
      <Navbar />
      <section className="home-hero">
        <div
          className="home-hero-image"
          role="img"
          aria-label="Learners collaborating on software development"
        />
        <div className="home-hero-shade" />
        <div className="home-hero-content">
          <div className="home-kicker">
            <span className="home-kicker-dot" /> BUILT FOR THE NEXT VERSION OF
            YOU
          </div>
          <h1>
            Make your next
            <br />
            skill <em>your superpower.</em>
          </h1>
          <p>
            Practical, project-led learning for people ready to build
            what&apos;s next. Start with Python, then follow your curiosity.
          </p>
          <div className="home-hero-actions">
            <Link href="/courses" className="home-primary-button">
              Explore courses <ArrowRight size={17} />
            </Link>
            <Link href="/auth/register" className="home-quiet-link">
              <span className="home-play-icon">
                <Play size={13} fill="currentColor" />
              </span>{" "}
              Start learning free
            </Link>
          </div>
          <div className="home-hero-proof">
            <div className="home-proof-avatars">
              <span>J</span>
              <span>M</span>
              <span>A</span>
              <span>+</span>
            </div>
            <span>
              <strong>
                {studentCount.toLocaleString()}
                {studentCount > 100 ? "+" : ""}
              </strong>{" "}
              {studentCount === 1 ? "learner" : "learners"} building real skills
            </span>
          </div>
        </div>
        <div className="home-code-window" aria-label="A Python code sample">
          <div className="home-code-top">
            <span>
              <i />
              <i />
              <i />
            </span>
            <small>first_project.py</small>
            <Terminal size={15} />
          </div>
          <pre>
            <span className="code-purple">def</span>{" "}
            <span className="code-yellow">build_your_future</span>():{"\n"}{" "}
            skills = [<span className="code-azure">&quot;curiosity&quot;</span>,
            {"\n"} <span className="code-azure">&quot;practice&quot;</span>,
            {"\n"} <span className="code-azure">&quot;you&quot;</span>]{"\n"}{" "}
            <span className="code-purple">return</span>{" "}
            <span className="code-yellow">make_it_real</span>(skills)
          </pre>
          <div className="home-code-status">
            <span /> Project-based learning <ArrowUpRight size={14} />
          </div>
        </div>
        <div className="home-scroll-cue">
          SCROLL TO EXPLORE <span />
        </div>
      </section>

      <section className="home-trust-strip">
        <div className="home-trust-label">
          LEARN A SKILL THAT MOVES YOU FORWARD
        </div>
        <div>
          <span>
            <Code2 size={16} /> BUILD REAL PROJECTS
          </span>
          <span>
            <GraduationCap size={18} /> LEARN AT YOUR PACE
          </span>
          <span>
            <Sparkles size={16} /> GROW YOUR CAREER
          </span>
        </div>
      </section>

      <section className="home-courses-section">
        <div className="home-section-heading">
          <div>
            <div className="home-section-eyebrow">THE COURSE LIBRARY</div>
            <h2>
              Learn by <em>making.</em>
            </h2>
            <p>Focused courses. Practical skills. Work you can show.</p>
          </div>
          <Link href="/courses" className="home-all-courses">
            Browse all courses <ArrowUpRight size={17} />
          </Link>
        </div>
        {courses.length ? (
          <div className="home-course-grid">
            {courses.map((course, index) => (
              <Link
                href={`/courses/${course.id}`}
                className="home-course"
                key={course.id}
              >
                <div
                  className={`home-course-art home-course-art-${index + 1}`}
                  style={
                    course.image
                      ? {
                          backgroundImage: `linear-gradient(0deg, rgba(15, 23, 32, .2), rgba(15, 23, 32, .04)), url("${course.image}")`,
                        }
                      : undefined
                  }
                >
                  <span>{course.category}</span>
                  <div className="home-course-art-mark">
                    {index === 0 ? (
                      <Code2 />
                    ) : index === 1 ? (
                      <Terminal />
                    ) : (
                      <BookOpen />
                    )}
                  </div>
                  <span className="home-course-level">
                    {course.level.toLowerCase()}
                  </span>
                </div>
                <div className="home-course-copy">
                  <h3>{course.title}</h3>
                  <p>{course.description}</p>
                  <div className="home-course-meta">
                    <span>
                      {course.instructor.firstName} {course.instructor.lastName}
                    </span>
                    <span>
                      {course.duration} hours <i /> {course._count.enrollments}{" "}
                      learners
                    </span>
                  </div>
                  <div className="home-course-bottom">
                    <strong>
                      {course.price ? `$${course.price.toFixed(0)}` : "Free"}
                    </strong>
                    <span>
                      View course <ArrowRight size={15} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="home-courses-empty">
            <BookOpen size={22} />
            <span>Your next course is on its way.</span>
            <Link href="/courses">
              Explore the course catalog <ArrowRight size={15} />
            </Link>
          </div>
        )}
      </section>

      <section className="home-bottom-cta">
        <div>
          <div className="home-section-eyebrow">
            YOUR NEXT CHAPTER STARTS HERE
          </div>
          <h2>
            Turn “someday” into
            <br />
            <em>something you built.</em>
          </h2>
        </div>
        <div className="home-cta-right">
          <p>
            Join a growing community of developers learning by doing, one good
            project at a time.
          </p>
          <Link href="/auth/register" className="home-primary-button">
            Create your account <ArrowRight size={17} />
          </Link>
          <span>
            {enrollmentCount.toLocaleString()}{" "}
            {enrollmentCount === 1 ? "course enrollment" : "course enrollments"}{" "}
            and counting
          </span>
        </div>
        <div className="home-cta-orbit" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>

      <footer className="home-footer">
        <Link href="/" className="home-footer-brand">
          <BrandLogo size={27} />
          ProPyCoder
        </Link>
        <span>Learn something real. Build something useful.</span>
        <div>
          <Link href="/courses">Courses</Link>
          <Link href="/pycoder">PyCoder</Link>
          <Link href="/auth/register">Join the community</Link>
        </div>
      </footer>
    </main>
  );
}
