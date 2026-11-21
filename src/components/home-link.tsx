"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { Play, ArrowRight } from "lucide-react";

interface Props {
  variant?: "quiet" | "primary";
}

export function HomeLearningLink({ variant = "quiet" }: Props) {
  const { data: session, status } = useSession();

  const user = session?.user;
  const isLoggedIn = status === "authenticated";

  const destination =
    user?.role === "ADMIN"
      ? "/admin"
      : user?.role === "INSTRUCTOR"
        ? "/instructor"
        : "/dashboard";

  const label = !isLoggedIn
    ? variant === "primary" ? "Create your account" : "Start learning"
    : user?.role === "ADMIN"
      ? "Admin dashboard"
      : user?.role === "INSTRUCTOR"
        ? "Instructor dashboard"
        : "Continue learning";

  return (
    <Link
      href={isLoggedIn ? destination : "/auth/register"}
      className={
        variant === "primary"
          ? "home-primary-button"
          : "home-quiet-link"
      }
    >
      {variant === "primary" ? (
        <>
          {label} <ArrowRight size={17} />
        </>
      ) : (
        <>
          <span className="home-play-icon">
            <Play size={13} fill="currentColor" />
          </span>{" "}
          {label}
        </>
      )}
    </Link>
  );
}