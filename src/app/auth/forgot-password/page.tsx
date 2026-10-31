"use client";

import { useState, FormEvent, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Mail, Loader, ArrowRight, CheckCircle2, X } from "lucide-react";
import toast from "react-hot-toast";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState<number | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogPortalRoot, setDialogPortalRoot] = useState<HTMLElement | null>(null);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hydratedFromStorage = useRef(false);

  useEffect(() => {
    setDialogPortalRoot(document.documentElement);
  }, []);

  const formatCooldown = (seconds: number): string => {
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      return `${h}h ${m}m ${s}s`;
    }
    if (seconds >= 60) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}m ${s}s`;
    }
    return `${seconds}s`;
  };

  // Restore cooldown from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("propycoder_pw_reset_next_allowed");
    if (stored) {
      const expiration = Number(stored);
      const remaining = Math.max(0, Math.floor((expiration - Date.now()) / 1000));
      if (remaining > 0) {
        setCooldown(remaining);
        cooldownTimer.current = setInterval(() => {
          setCooldown((prev) => {
            if (prev === null || prev <= 1) {
              if (cooldownTimer.current) clearInterval(cooldownTimer.current);
              cooldownTimer.current = null;
              return null;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        localStorage.removeItem("propycoder_pw_reset_next_allowed");
      }
    }
    hydratedFromStorage.current = true;
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  // Persist cooldown to localStorage
  useEffect(() => {
    if (!hydratedFromStorage.current) return;
    if (cooldown !== null) {
      const expiration = Date.now() + cooldown * 1000;
      localStorage.setItem("propycoder_pw_reset_next_allowed", expiration.toString());
    } else {
      localStorage.removeItem("propycoder_pw_reset_next_allowed");
    }
  }, [cooldown]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send reset email.");
      setShowDialog(true);

      if (data.resendNextAllowedAt) {
        const expiration = new Date(data.resendNextAllowedAt).getTime();
        const remaining = Math.max(0, Math.floor((expiration - Date.now()) / 1000));
        if (remaining > 0) {
          setCooldown(remaining);
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          cooldownTimer.current = setInterval(() => {
            setCooldown((prev) => {
              if (prev === null || prev <= 1) {
                if (cooldownTimer.current) clearInterval(cooldownTimer.current);
                cooldownTimer.current = null;
                return null;
              }
              return prev - 1;
            });
          }, 1000);
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send reset email.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <Navbar />
      <main className="auth-layout">
        <section className="auth-content">
          <div className="auth-card">
            <div className="auth-card-eyebrow">PASSWORD RESET</div>
            <h1>Forgot Password</h1>
            <p className="auth-card-description">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            {showDialog && dialogPortalRoot && createPortal(
              <div
                className="auth-dialog-backdrop"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setShowDialog(false);
                }}
              >
                <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-dialog-title">
                  <button className="auth-dialog-close" type="button" onClick={() => setShowDialog(false)} aria-label="Close dialog">
                    <X size={19} />
                  </button>
                  <div className="auth-dialog-icon"><Mail size={22} /></div>
                  <div className="auth-card-eyebrow">ONE QUICK STEP</div>
                  <h2 id="reset-dialog-title">Check your inbox</h2>
                  <p className="auth-dialog-description">
                    If an account exists with <strong>{email}</strong>, a password reset link has been sent. Check your spam folder if it doesn't arrive.
                  </p>
                  {cooldown !== null ? (
                    <button className="auth-submit" type="button" disabled>
                      <Loader className="h-4 w-4 animate-spin" />
                      Resend in {formatCooldown(cooldown)}
                    </button>
                  ) : (
                    <button
                      className="auth-submit"
                      type="button"
                      onClick={() => setShowDialog(false)}
                    >
                      Back <ArrowRight size={16} />
                    </button>
                  )}
                  {cooldown !== null && (
                    <p className="auth-dialog-help">You can request another link after the cooldown expires.</p>
                  )}
                  <p className="auth-dialog-help">The link expires after 30 minutes.</p>
                </section>
              </div>,
              dialogPortalRoot
            )}
            {!showDialog && (
              <form onSubmit={handleSubmit} className="auth-form">
                <div className="auth-field">
                  <label>Email address</label>
                  <div className="auth-field-control">
                    <Mail size={17} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="auth-input"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="auth-submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <><Loader className="h-4 w-4 animate-spin" /> Sending...</>
                  ) : (
                    <>Send reset link <ArrowRight size={16} /></>
                  )}
                </button>
              </form>
            )}

            <div className="auth-switch">
              Remember your password? <Link href="/auth/login">Sign in</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}