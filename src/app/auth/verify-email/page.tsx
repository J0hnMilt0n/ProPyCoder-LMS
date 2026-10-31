"use client";

import { FormEvent, Suspense, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/navbar";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [isSentConfirmation, setIsSentConfirmation] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendStatus, setResendStatus] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [state, setState] = useState<"ready" | "loading" | "success" | "error">(
    token ? "ready" : "success",
  );
  const [message, setMessage] = useState(token
    ? "Confirm your email address to activate your account."
    : "Open the verification link sent to your email address.");

  useEffect(() => {
    const sent = searchParams.get("sent") === "1";
    setIsSentConfirmation(sent);
    if (sent) {
      setMessage("Your account was created. Check your inbox for the verification link. It is valid for 30 minutes.");
    }
  }, [searchParams]);

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      setState("error");
      setMessage("This verification link is invalid or expired.");
      return;
    }

    setState("loading");
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Verification failed.");
      setState("success");
      setMessage(data.message);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Verification failed.");
    }
  };

  const [resendCooldown, setResendCooldown] = useState<number | null>(null);
  const resendCooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const resendStartedAt = useRef<number | null>(null);
  const hydratedFromStorage = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem("propycoder_resend_next_allowed");
    if (stored) {
      const expiration = Number(stored);
      const remaining = Math.max(0, Math.floor((expiration - Date.now()) / 1000));
      if (remaining > 0) {
        setResendCooldown(remaining);
        resendStartedAt.current = Date.now();
        resendCooldownTimer.current = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev === null || prev <= 1) {
              if (resendCooldownTimer.current) clearInterval(resendCooldownTimer.current);
              resendCooldownTimer.current = null;
              return null;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        localStorage.removeItem("propycoder_resend_next_allowed");
      }
    }
    hydratedFromStorage.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedFromStorage.current) return;
    if (resendCooldown !== null && resendStartedAt.current) {
      const expiration = resendStartedAt.current + resendCooldown * 1000;
      localStorage.setItem("propycoder_resend_next_allowed", expiration.toString());
    } else {
      localStorage.removeItem("propycoder_resend_next_allowed");
    }
  }, [resendCooldown, resendStartedAt]);

  const formatCooldown = (seconds: number): string => {
    if (seconds >= 3600) {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return `${hours}h ${mins}m ${secs}s`;
    }
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    }
    return `${seconds}s`;
  };

  const startResendCooldown = (durationSeconds: number) => {
    setResendCooldown(durationSeconds);
    resendStartedAt.current = Date.now();
    if (resendCooldownTimer.current) clearInterval(resendCooldownTimer.current);
    resendCooldownTimer.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev === null || prev <= 1) {
          if (resendCooldownTimer.current) clearInterval(resendCooldownTimer.current);
          resendCooldownTimer.current = null;
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (resendCooldown !== null) return;
    setIsResending(true);
    setResendStatus("");

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not resend verification email.");
      setResendStatus(data.message);
      if (data.resendNextAllowedAt) {
        const expiration = new Date(data.resendNextAllowedAt).getTime();
        const remaining = Math.max(0, Math.floor((expiration - Date.now()) / 1000));
        setResendCooldown(remaining);
        resendStartedAt.current = Date.now();
        if (resendCooldownTimer.current) clearInterval(resendCooldownTimer.current);
        resendCooldownTimer.current = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev === null || prev <= 1) {
              if (resendCooldownTimer.current) clearInterval(resendCooldownTimer.current);
              resendCooldownTimer.current = null;
              return null;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        startResendCooldown(10);
      }
    } catch (error) {
      setResendStatus(error instanceof Error ? error.message : "Could not resend verification email.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="auth-page">
      <Navbar />
      <main className="auth-layout">
        <section className="auth-content">
          <div className="auth-card">
            <div className="auth-card-eyebrow">EMAIL VERIFICATION</div>
            <h1>{token ? state === "success" ? "Email verified" : state === "error" ? "Verification link unavailable" : "Verify your email" : "Check your inbox"}</h1>
            <p className="auth-card-description" role="status">{message}</p>
            {!token && isSentConfirmation && <p className="auth-card-description">The verification link is valid for 30 minutes.</p>}
            {token && state === "ready" && (
              <form onSubmit={handleVerify}>
                <button className="auth-submit" type="submit">Verify email address</button>
              </form>
            )}
            {token && state === "loading" && <button className="auth-submit" type="button" disabled>Verifying…</button>}
            {(state === "success" && token) || isSentConfirmation ? (
              <Link className="auth-submit" href="/auth/login">Continue to sign in</Link>
            ) : token && state === "error" ? (
              <Link className="auth-submit" href="/auth/register">Back to registration</Link>
            ) : null}
            {!token && state === "success" && !isSentConfirmation && (
              <form onSubmit={handleResend} className="auth-form">
                <div className="auth-field">
                  <label htmlFor="resend-email">Email address</label>
                  <input id="resend-email" className="auth-input" type="email" required maxLength={254} autoComplete="email" value={resendEmail} onChange={(event) => setResendEmail(event.target.value)} />
                </div>
                <button className="auth-submit" type="submit" disabled={isResending || Boolean(resendCooldown)}>
  {isResending ? "Sending..." : resendCooldown !== null ? `Resending in ${formatCooldown(resendCooldown)}` : "Resend verification email"}
</button>
                {resendStatus && <p className="auth-card-description" role="status">{resendStatus}</p>}
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function VerifyEmailPage() {
  return <Suspense fallback={<main className="auth-page"><Navbar /><p className="auth-card-description">Loading…</p></main>}><VerifyEmailContent /></Suspense>;
}