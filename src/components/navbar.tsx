"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  ArrowUpRight,
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
import { useConfirm } from "@/components/confirm-dialog";
import { useTheme } from "@/components/theme-provider";
import { useResource, clearResourceCaches } from "@/lib/use-resource";

function persistAuthHint(authenticated: boolean, userId?: string) {
  const hint = authenticated ? "authenticated" : "unauthenticated";
  document.documentElement.dataset.authHint = hint;
  try {
    localStorage.setItem("propycoder-auth-hint", hint);
    if (authenticated && userId) {
      sessionStorage.setItem("propycoder-auth-user-id", userId);
    } else {
      sessionStorage.removeItem("propycoder-auth-user-id");
    }
  } catch (error) {
    console.warn("Could not persist the navbar auth hint", error);
  }
}

export function Navbar() {
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [loadedAvatarUrl, setLoadedAvatarUrl] = useState<string | null>(null);
  const user = session?.user;
  const avatarUrl = user?.image;
  const confirm = useConfirm();

  const handleSignOut = async () => {
    const shouldSignOut = await confirm({
      title: "Sign out?",
      message: "Are you sure you want to sign out?",
      confirmLabel: "Sign out",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!shouldSignOut) return;

    persistAuthHint(false);
    // Wipe per-user resource caches so the next account on this
    // browser never sees the previous user's cached data.
    clearResourceCaches();
    setIsOpen(false);
    await signOut({ callbackUrl: "/" });
  };

  useEffect(() => {
    if (status === "authenticated") {
      persistAuthHint(true, user?.id);
    } else if (status === "unauthenticated") {
      persistAuthHint(false);
    }
  }, [status, user?.id]);
  // Unread inbox count for the bell badge (logged-in users only).
  // Keyed on user id so logging out naturally resets the badge to 0.
  const userId = user?.id ?? null;
  // Paint the cached unread count instantly, then refresh in the background
  // (the hook patches only when the number actually changes).
  const unreadRes = useResource<number>({
    key: "notifications-unread",
    url: "/api/notifications",
    scope: userId ?? "",
    enabled: Boolean(userId),
    select: (json) => (json as { unread?: number }).unread ?? 0,
  });
  const unread = unreadRes.data ?? 0;
  const { theme, toggleTheme } = useTheme();
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
        <Link
          href="/"
          className="site-brand -ml-3"
          aria-label="ProPyCoder home"
        >
          <BrandLogo />
          <span className="md:-ml-2 -ml-3 mr-2">ProPyCoder</span>
        </Link>
        <div className={`site-nav-links ${isOpen ? "is-open" : ""}`}>
          <Link
            href="/pycoder"
            prefetch={false}
            className="site-nav-link-lab"
            onClick={() => setIsOpen(false)}
          >
            PyCoder <span className="nav-new">LAB</span>
          </Link>
          <Link
            href="/courses"
            className="site-nav-link-courses"
            onClick={handleCoursesTab}
          >
            Courses
          </Link>
          <Link href="/bundles" onClick={() => setIsOpen(false)}>
            Bundles
          </Link>
          <Link href="/live-classes" onClick={() => setIsOpen(false)}>
            Live classes
          </Link>
          {user && (
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
            </>
          )}{" "}
          <Link href="/certificates" onClick={() => setIsOpen(false)}>
            Certificates
          </Link>
          <Link
            href="/announcements"
            className="site-nav-link-announcements"
            onClick={() => setIsOpen(false)}
          >
            Announcements{" "}
            <span>
              {unread > 0 && (
                <span className="nav-new">{unread > 9 ? "9+" : unread}</span>
              )}
            </span>
          </Link>
          <button
            className="theme-switch"
            type="button"
            onClick={(event) => toggleTheme(event.currentTarget)}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          >
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            <span>{theme === "light" ? "Dark" : "Light"}</span>
          </button>
          {user && (
            <button
              type="button"
              className="site-signout"
              onClick={handleSignOut}
            >
              <LogOut size={15} /> Sign out
            </button>
          )}
          {status !== "authenticated" && (
            <>
              <Link
                className="site-login site-account-guest"
                href="/auth/login"
                onClick={() => setIsOpen(false)}
              >
                Log in
              </Link>
              <Link
                className="site-nav-cta site-account-guest"
                href="/auth/register"
                onClick={() => setIsOpen(false)}
              >
                Get started <ArrowUpRight size={15} />
              </Link>
            </>
          )}
        </div>
        <Link
          href="/pycoder"
          className="site-shortcuts site-shortcut"
          onClick={() => setIsOpen(false)}
        >
          <FlaskConical size={14} />
        </Link>
        <Link
          href="/courses"
          className="site-shortcut"
          onClick={handleCoursesTab}
        >
          <BookOpen size={14} />
        </Link>
        <Link
          href="/announcements"
          className={`site-shortcut${user ? " site-bell" : ""}`}
          aria-label={
            user && unread > 0
              ? `Announcements, ${unread} unread`
              : "Announcements"
          }
          title="Announcements"
          onClick={() => setIsOpen(false)}
        >
          <Megaphone size={14} />
          {user && unread > 0 && (
            <span className="site-bell-badge">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
        <button
          className="site-shortcut site-theme-shortcut"
          type="button"
          onClick={(event) => toggleTheme(event.currentTarget)}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
        >
          {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
        </button>
        {status === "loading" && !user && (
          <span
            className="site-user-session-skeleton"
            aria-hidden="true"
          />
        )}
        {user && (
          <Link
            className="site-user-chip nav-account-reveal"
            href="/profile"
            title="Your profile"
          >
            {avatarUrl ? (
              <div className="site-user-avatar-wrap">
                {loadedAvatarUrl !== avatarUrl && (
                  <span
                    className="site-user-avatar-skeleton"
                    aria-hidden="true"
                  />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={`site-user-avatar${loadedAvatarUrl === avatarUrl ? " is-loaded" : ""}`}
                  src={avatarUrl}
                  alt={user.name ?? "Your avatar"}
                  width={26}
                  height={26}
                  onLoad={() => setLoadedAvatarUrl(avatarUrl)}
                  onError={() => setLoadedAvatarUrl(avatarUrl)}
                />
              </div>
            ) : (
              <span>
                {user.name
                  ?.split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2) ?? "P"}
              </span>
            )}
            {/* <ChevronDown size={13} /> */}
          </Link>
        )}
        {/* {user && (
          <button
            type="button"
            className="site-signout site-signout-toolbar nav-account-reveal"
            onClick={handleSignOut}
          >
            <LogOut size={15} /> Sign out
          </button>
        )} */}

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
