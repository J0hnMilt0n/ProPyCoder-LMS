"use client";

import { useState, FormEvent, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Lock, Loader, ArrowRight, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not reset password.");
      setSuccess(true);
      toast.success("Password reset successfully!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reset password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-page">
        <Navbar />
        <main className="auth-layout">
          <section className="auth-content">
            <div className="auth-card">
              <div className="auth-card-eyebrow">PASSWORD RESET</div>
              <h1>Invalid Link</h1>
              <p className="auth-card-description">
                This password reset link is invalid or has expired.
              </p>
              <Link className="auth-submit px-2" href="/auth/forgot-password">
                Request a new link
              </Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <Navbar />
      <main className="auth-layout">
        <section className="auth-content">
          <div className="auth-card">
            <div className="auth-card-eyebrow">PASSWORD RESET</div>
            <h1>Reset Password</h1>
            <p className="auth-card-description">
              Enter your new password below.
            </p>

            {success ? (
              <div>
                <div className="auth-dialog-success" role="status">
                  <CheckCircle2 size={18} />
                  <span>Password has been reset successfully.</span>
                </div>
                <Link className="auth-submit px-2" href="/auth/login" style={{ marginTop: 16, display: "inline-flex" }}>
                  Continue to sign in <ArrowRight size={16} />
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="auth-form">
                <div className="auth-field">
                  <label>New password</label>
                  <div className="auth-field-control">
                    <Lock size={17} />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      className="auth-input"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <div className="auth-field">
                  <label>Confirm password</label>
                  <div className="auth-field-control">
                    <Lock size={17} />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      className="auth-input"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <button type="submit" className="auth-submit px-2" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <><Loader className="h-4 w-4 animate-spin" /> Resetting...</>
                  ) : (
                    <>Reset password <ArrowRight size={16} /></>
                  )}
                </button>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="auth-page"><Navbar /><p className="auth-card-description">Loading…</p></main>}>
      <ResetPasswordContent />
    </Suspense>
  );
}