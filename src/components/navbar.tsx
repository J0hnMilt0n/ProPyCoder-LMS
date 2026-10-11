"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  ArrowUpRight,
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useTheme } from "@/components/theme-provider";

export function Navbar() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const user = session?.user;
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
          <span>ProPyCoder</span>
        </Link>
        <div className={`site-nav-links ${isOpen ? "is-open" : ""}`}>
          <Link href="/courses" onClick={handleCoursesTab}>
            Courses
          </Link>
          <Link href="/pycoder" onClick={() => setIsOpen(false)}>
            PyCoder <span className="nav-new">LAB</span>
          </Link>
          <Link href="/certificates" onClick={() => setIsOpen(false)}>
            Certificates
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
        {user && (
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
