"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Award, LoaderCircle, Lock } from "lucide-react";
import toast from "react-hot-toast";

interface Certificate {
  id: string;
  course: string;
  issueDate: string;
  certificateNumber: string;
}

export default function CertificatesPage() {
  const { status } = useSession();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [verifyNumber, setVerifyNumber] = useState("");
  const [verifyResult, setVerifyResult] = useState<Certificate | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  async function verifyCertificate() {
    const number = verifyNumber.trim();
    if (!number) return;
    setVerifyResult(null);
    setVerifyError(null);
    setIsVerifying(true);
    try {
      const response = await fetch(
        "/api/certificates/verify?number=" + encodeURIComponent(number),
      );
      const data = await response.json();
      if (response.ok) {
        setVerifyResult(data);
      } else {
        setVerifyError(data.error ?? "No certificate found with that number.");
      }
    } catch {
      setVerifyError("Could not reach the verification service. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  }

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/certificates", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setCertificates(data.data ?? []);
      } else {
        toast.error("Could not load your certificates");
      }
    } catch {
      toast.error("Could not load your certificates");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Public page: the verify tool works without an account; personal
  // certificates only load once signed in.
  useEffect(() => {
    if (status === "authenticated") void load();
  }, [status, load]);

  if (status === "loading" || (status === "authenticated" && isLoading)) {
    return (
      <div className="auth-page">
        <Navbar />
        <main className="auth-layout">
          <div className="auth-content">
            <div className="auth-card" style={{ textAlign: "center" }}>
              <LoaderCircle
                className="animate-spin"
                size={28}
                style={{ margin: "0 auto", color: "#e95f32" }}
              />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <Navbar />
      <main className="auth-layout">
        <div className="auth-content">
          <div className="auth-card cert-page-card">
            <div className="auth-card-eyebrow">YOUR ACHIEVEMENTS</div>
            <h1>Certificates</h1>
            <p className="auth-card-description">
              {status === "unauthenticated"
                ? "Check any ProPyCoder certificate below — no account needed."
                : "Certificates unlock automatically when you finish every lesson in a course."}
            </p>

            <section className="cert-verify">
              <div className="auth-card-eyebrow">Verify certificate</div>
              <h2>Verify by certificate number</h2>
              <p>
                Enter a certificate number below to confirm it is valid and belongs to you. Your own numbers are listed as <span className="cert-item-meta"><strong>certificate number</strong></span> on each certificate below.
              </p>
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  void verifyCertificate();
                }}
              >
                <div className="auth-field">
                  <label htmlFor="cert-number">Certificate number</label>
                  <input
                    id="cert-number"
                    name="number"
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    maxLength={32}
                    placeholder="PPC-2026-XXXXXXXX"
                    spellCheck={false}
                    value={verifyNumber}
                    onChange={(event) => setVerifyNumber(event.target.value)}
                  />
                </div>
                <button type="submit" className="auth-submit p-3" disabled={isVerifying}>
                  {isVerifying ? <LoaderCircle className="animate-spin" size={16} /> : "Verify"}
                </button>
              </form>
              {verifyError ? (
                <p className="auth-form-error" role="alert">{verifyError}</p>
              ) : null}
              {verifyResult ? (
                <div className="cert-verify-result">
                  <strong>{verifyResult.course}</strong>
                  <span className="cert-item-meta">
                    Issued {new Date(verifyResult.issueDate).toLocaleDateString()} · {verifyResult.certificateNumber}
                  </span>
                  <Link href={`/certificates/${verifyResult.id}`} className="auth-submit">
                    View certificate
                  </Link>
                </div>
              ) : null}
            </section>
            {status === "unauthenticated" ? (
              <div className="cert-empty">
                <span className="cert-empty-icon" aria-hidden="true">
                  <Lock size={22} />
                </span>
                <h2>Your certificates live in your account</h2>
                <p>
                  Log in to see and download the certificates you have earned —
                  anyone can still verify a certificate with the tool above.
                </p>
                <Link href="/auth/login" className="auth-submit cert-empty-link">
                  Log in
                </Link>
              </div>
            ) : certificates.length === 0 ? (
              <div className="cert-empty">
                <span className="cert-empty-icon" aria-hidden="true">
                  <Lock size={22} />
                </span>
                <h2>No certificates yet</h2>
                <p>
                  Complete all lessons in an enrolled course to earn your first
                  certificate.
                </p>
                <Link href="/courses" className="auth-submit cert-empty-link">
                  Browse courses
                </Link>
              </div>
            ) : (
              <ul className="cert-list">
                {certificates.map((certificate) => (
                  <li key={certificate.id} className="cert-item">
                    <Link
                      href={`/certificates/${certificate.id}`}
                      className="cert-item-link"
                    >
                      <span className="cert-item-icon" aria-hidden="true">
                        <Award size={18} />
                      </span>
                      <span className="cert-item-body">
                        <strong>{certificate.course}</strong>
                        <span className="cert-item-meta">
                          Issued {" "}
                          {new Date(certificate.issueDate).toLocaleDateString()}
                          {" · "}
                          {certificate.certificateNumber}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
