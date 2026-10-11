"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  ChevronDown,
  FlaskConical,
  LogOut,
  Megaphone,
  Menu,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
// import { useTheme } from "@/components/theme-provider";

export function Navbar() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const user = session?.user;
  // Unread inbox count for the bell badge (logged-in users only).
  // Keyed on user id so logging out naturally resets the badge to 0.
  const userId = user?.id ?? null;
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const loadUnread = async () => {
      try {
        const response = await fetch("/api/notifications");
        if (!response.ok) return;
        const data = (await response.json()) as { unread?: number };
        if (!cancelled) setUnread(data.unread ?? 0);
      } catch {
        // Badge is best-effort — inbox page still shows the count.
      }
    };
    void loadUnread();
    return () => {
      cancelled = true;
    };
  }, [userId]);
  // const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  // When hopping lab → Courses, return to the course the user had open
  // (its scroll position is restored by the course page itself).
  // Anywhere else the Courses tab behaves normally and shows the list.
  const handleCoursesTab = (event: React.MouseEvent<HTMLAnchorElement>) => {
    setIsOpen(false);
    if (pathname !== "/pycoder") return;
    let lastCourseId: string | null = null;
    try {
      lastCourseId = window.sessionStorage.getItem("propycoder-last-course");
    } catch {
      // Storage unavailable — fall through to the catalog.
    }
    if (!lastCourseId) return;
    event.preventDefault();
    router.push(`/courses/${lastCourseId}`);
  };

  return (
    <nav className="site-nav">
      <div className="site-nav-inner">
        <Link href="/" className="site-brand" aria-label="ProPyCoder home">
          <BrandLogo />
          <span className="md:-ml-3 -ml-3">ProPyCoder</span>
        </Link>
        <div className={`site-nav-links ${isOpen ? "is-open" : ""}`}>
          <Link
            href="/courses"
            className="site-nav-link-courses"
            onClick={handleCoursesTab}
          >
            Courses
          </Link>
          <Link
            href="/pycoder"
            className="site-nav-link-lab"
            onClick={() => setIsOpen(false)}
          >
            PyCoder <span className="nav-new">LAB</span>
          </Link>
          <Link href="/certificates" onClick={() => setIsOpen(false)}>
            Certificates
          </Link>
          <Link
            href="/announcements"
            className="site-nav-link-announcements"
            onClick={() => setIsOpen(false)}
          >
             Announcements <span>{(unread > 0 && (
                <span className="nav-new">
                  {unread > 9 ? "9+" : unread}
                </span>
              ))}</span>
          </Link>
          {/* <button
            className="theme-switch"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          >
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            <span>{theme === "light" ? "Dark" : "Light"}</span>
          </button> */}
          {user ? (
            <>
              {user.role === "ADMIN" && (
                <Link href="/admin" onClick={() => setIsOpen(false)}>
                  Admin workspace
                </Link>
              )}
              {user.role === "INSTRUCTOR" && (
                <Link href="/instructor" onClick={() => setIsOpen(false)}>
                  My courses
                </Link>
              )}
              {user.role === "STUDENT" && (
              <Link href="/dashboard" onClick={() => setIsOpen(false)}>
                My learning
              </Link>
              )}
              <button
                className="site-signout"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                <LogOut size={15} /> Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                className="site-login"
                href="/auth/login"
                onClick={() => setIsOpen(false)}
              >
                Log in
              </Link>
              <Link
                className="site-nav-cta"
                href="/auth/register"
                onClick={() => setIsOpen(false)}
              >
                Get started <ArrowUpRight size={15} />
              </Link>
            </>
          )}
        </div>
        <Link
          href="/courses"
          className="site-lab-shortcut site-courses-shortcut"
          onClick={handleCoursesTab}
        >
          <BookOpen size={14} />
        </Link>
        <Link
          href="/pycoder"
          className="site-lab-shortcut"
          onClick={() => setIsOpen(false)}
        >
          <FlaskConical size={14} />
        </Link>
        {!user && (
          <Link
            href="/announcements"
            className="site-lab-shortcut site-announce-shortcut"
            onClick={() => setIsOpen(false)}
            aria-label="Announcements"
            title="Announcements"
          >
            <Megaphone size={14} />
          </Link>
        )}
        {user && (
          <>
            <Link
              href="/announcements"
              className="site-bell"
              aria-label={
                unread > 0
                  ? `Announcements, ${unread} unread`
                  : "Announcements"
              }
              title="Announcements"
            >
              <Megaphone size={14} />
              {unread > 0 && (
                <span className="site-bell-badge">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
            <Link
              className="site-user-chip"
              href="/profile"
              title="Your profile"
            >
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="site-user-avatar"
                src={user.image}
                alt={user.name ?? "Your avatar"}
                width={26}
                height={26}
              />
            ) : (
              <span>
                {user.name
                  ?.split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2) ?? "P"}
              </span>
            )}
            <ChevronDown size={13} />
          </Link>
          </>
        )}
        <button
          className="site-menu-toggle"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={isOpen}
        >
          {isOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
    </nav>
  );
}
