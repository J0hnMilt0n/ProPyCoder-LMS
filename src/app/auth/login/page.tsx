"use client";

import { useEffect, useState, FormEvent, useRef } from "react";
import { createPortal } from "react-dom";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Navbar } from "@/components/navbar";
import { ArrowRight, CheckCircle2, Eye, EyeOff, Lock, Mail, Loader, X } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");
  const [dialogPortalRoot, setDialogPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setDialogPortalRoot(document.documentElement);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setEmailError("");
    setPasswordError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        if (result.code === "invalid-email") {
          setEmailError("No account was found with this email address.");
        } else if (result.code === "invalid-password") {
          setPasswordError("That password is incorrect. Please try again.");
        } else if (result.code === "email-not-verified") {
          setShowVerificationDialog(true);
          setResendMessage("");
          setResendError("");
        } else {
          toast.error("We couldn't sign you in. Please check your details and try again.");
        }
      } else {
        toast.success("Login successful!");
        router.push("/dashboard");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const [resendCooldown, setResendCooldown] = useState<number | null>(null);
  const resendCooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!showVerificationDialog || !email.trim()) return;
    fetch(`/api/auth/resend-verification?email=${encodeURIComponent(email.trim())}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.resendNextAllowedAt) {
          const expiration = new Date(data.resendNextAllowedAt).getTime();
          const remaining = Math.max(0, Math.floor((expiration - Date.now()) / 1000));
          if (remaining > 0) {
            startResendCooldown(remaining);
          }
        }
      })
      .catch(() => {});
  }, [showVerificationDialog, email]);

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

  useEffect(() => {
    return () => {
      if (resendCooldownTimer.current) clearInterval(resendCooldownTimer.current);
    };
  }, []);

  const startResendCooldown = (durationSeconds: number) => {
    if (resendCooldownTimer.current) clearInterval(resendCooldownTimer.current);
    setResendCooldown(durationSeconds);
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

  const handleResendVerification = async () => {
    if (resendCooldown !== null) return;
    setIsResending(true);
    setResendMessage("");
    setResendError("");

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send a verification email.");
      setResendMessage("If your account is still unverified, a fresh verification link is on its way. Check your inbox.");
      if (data.resendNextAllowedAt) {
        const expiration = new Date(data.resendNextAllowedAt).getTime();
        const remaining = Math.max(0, Math.floor((expiration - Date.now()) / 1000));
        startResendCooldown(remaining);
      } else {
        startResendCooldown(10);
      }
    } catch (error) {
      setResendError(error instanceof Error ? error.message : "Could not send a verification email. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="auth-page">
      <Navbar />

      <main className="auth-layout">
        <aside className="auth-story">
          <span className="auth-story-eyebrow">LEARN SOMETHING REAL</span>
          <h2>
            Build a skill.
            <br />
            <em>Build your future.</em>
          </h2>
          <p>
            Pick up your learning journey where you left off. Your next project
            is closer than you think.
          </p>
          <div className="auth-story-code">
            <span>01</span>
            <code>learn()</code>
            <i />
            <code>build()</code>
            <i />
            <code>repeat()</code>
          </div>
          <span className="auth-story-caption">
            A little progress, every day.
          </span>
        </aside>
        <section className="auth-content">
          <div className="auth-card">
            <div className="auth-card-eyebrow">YOUR WORKSPACE</div>
            <h1>Welcome Back</h1>
            <p className="auth-card-description">
              Sign in to your ProPyCoder account
            </p>

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="auth-field">
                <label>Email Address</label>
                <div className="auth-field-control">
                  <Mail size={17} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailError("");
                    }}
                    required
                    aria-invalid={Boolean(emailError)}
                    aria-describedby={emailError ? "login-email-error" : undefined}
                    className="auth-input"
                    placeholder="you@example.com"
                  />
                </div>
                {emailError && <p className="auth-field-error" id="login-email-error" role="alert">{emailError}</p>}
              </div>

              <div className="auth-field">
                <label>Password</label>
                <div className="auth-field-control">
                  <Lock size={17} />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordError("");
                    }}
                    required
                    aria-invalid={Boolean(passwordError)}
                    aria-describedby={passwordError ? "login-password-error" : undefined}
                    className="auth-input"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {passwordError && <p className="auth-field-error" id="login-password-error" role="alert">{passwordError}</p>}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="auth-submit"
              >
                {isLoading && <Loader className="h-4 w-4 animate-spin" />}
                {isLoading ? (
                  "Signing in..."
                ) : (
                  <>
                    Sign in <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div className="auth-switch">
              New to ProPyCoder?{" "}
              <Link href="/auth/register">Create an account</Link>
            </div>
          </div>
        </section>
      </main>
      {showVerificationDialog && dialogPortalRoot && createPortal((
        <div
          className="auth-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowVerificationDialog(false);
          }}
        >
          <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="verification-dialog-title">
            <button className="auth-dialog-close" type="button" onClick={() => setShowVerificationDialog(false)} aria-label="Close dialog">
              <X size={19} />
            </button>
            <div className="auth-dialog-icon"><Mail size={22} /></div>
            <div className="auth-card-eyebrow">ONE QUICK STEP</div>
            <h2 id="verification-dialog-title">Verify your email</h2>
            <p className="auth-dialog-description">This account hasn’t been verified yet. Open the verification link we sent to <strong>{email}</strong> to finish signing in.</p>
            {resendMessage ? (
              <div className="auth-dialog-success" role="status"><CheckCircle2 size={18} /><span>{resendMessage}</span></div>
            ) : resendCooldown !== null ? (
              <button className="auth-submit" type="button" disabled>
                <Loader className="h-4 w-4 animate-spin" />
                Resending in {formatCooldown(resendCooldown)}
              </button>
            ) : (
              <button className="auth-submit" type="button" onClick={handleResendVerification} disabled={isResending || !email.trim()}>
                {isResending ? <><Loader className="h-4 w-4 animate-spin" /> Sending...</> : "Resend verification email"}
                {!isResending && <ArrowRight size={16} />}
              </button>
            )}
            {resendError && <p className="auth-field-error auth-dialog-error" role="alert">{resendError}</p>}
            <p className="auth-dialog-help">The link expires after 30 minutes. Check your spam folder if it doesn’t arrive.</p>
          </section>
        </div>
      ), dialogPortalRoot)}
    </div>
  );
}
