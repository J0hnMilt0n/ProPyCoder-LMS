"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { ArrowRight, Award, LoaderCircle, Lock, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { useResource } from "@/lib/use-resource";

interface Certificate {
  id: string;
  course: string;
  issueDate: string;
  certificateNumber: string;
}

export default function CertificatesPage() {
  const { data: session, status } = useSession();
  const certificatesRes = useResource<Certificate[]>({
  key: "certificates",
  url: "/api/certificates",
  scope: session?.user?.id ?? "me",
  enabled: status === "authenticated",
  freshForMs: 5 * 60 * 1000,
  revalidateOnFocus: true,
  select: (json) => (json as { data?: Certificate[] }).data ?? [],
});
  const certificates = certificatesRes.data ?? [];
  const isLoading = certificatesRes.isLoading;

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

  useEffect(() => {
    if (status === "authenticated" && certificatesRes.error) {
      toast.error("Could not load your certificates");
    }
  }, [status, certificatesRes.error]);

  // if (status === "loading" || (status === "authenticated" && isLoading)) {
  //   return (
  //     <div className="auth-page-">
  //       <Navbar />
  //       <main className="auth-layout-">
  //         <div className="auth-content">
  //           <div className="auth-card" style={{ textAlign: "center" }}>
  //             <LoaderCircle
  //               className="animate-spin"
  //               size={28}
  //               style={{ margin: "0 auto", color: "#e95f32" }}
  //             />
  //           </div>
  //         </div>
  //       </main>
  //     </div>
  //   );
  // }

  return (
     <main className="catalog-page certificates-page">
      <Navbar />
      <header className="catalog-hero">
              <div className="catalog-hero-inner">
                <div className="catalog-eyebrow">
                  <Award size={14} /> YOUR ACHIEVEMENTS
                </div>
      
                <div className="catalog-hero-row">
                  <div>
                    <h1>
                      Earned <em>certificates.</em>
                    </h1>
                    <p>
                      Celebrate your skills, showcase your achievements, and verify
                      certificates issued by ProPyCoder.
                    </p>
                  </div>
      
                  <div className="catalog-hero-note">
                    <span>YOUR ACHIEVEMENTS</span>
                    <strong>Every completed course is a milestone.</strong>
                  </div>
                </div>
              </div>
            </header>
        <section className="catalog-section">
          <div className="-auth-card -cert-page-card md:flex justify-evenly gap-6">

            <section className="cert-verify md:w-[50%]">
               <div className="catalog-eyebrow"><ShieldCheck size={14} />VERIFY CERTIFICATE</div>
              {/* <h2>Verify by certificate number</h2> */}
              <p>
                Enter a certificate number below to confirm its authenticity.
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
                  <Link href={`/certificates/${verifyResult.certificateNumber}`} className="auth-submit">
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
                  Log in to see and download the certificates you have earned.
                  Anyone can still verify a certificate with the tool above.
                </p>
                <Link href="/auth/login" className="auth-submit cert-empty-link">
                  Log in
                </Link>
              </div>
            ) : isLoading ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <LoaderCircle
                  className="animate-spin"
                  size={28}
                  style={{ margin: "0 auto", color: "#e95f32" }}
                />
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
              <ul className="cert-list"><div className="catalog-section-heading">
          <div>
            <span className="catalog-eyebrow">YOUR COLLECTION <span className="cert-verify-count">
              {certificates.length}
            </span></span>
            {/* <h2>My certificates</h2> */}
          </div>
  
        </div>
                {certificates.map((certificate) => (
                  <li key={certificate.id} className="cert-item">
                    <Link
                      href={`/certificates/${certificate.certificateNumber}`}
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
        </section>
        {/* Footer */}
      <footer className="catalog-footer">
        <span>PROPYCODER LEARNING</span>
        <span>Stay informed. Keep growing.</span>

        <Link href="/courses">
          Browse all courses
          <ArrowRight size={14} />
        </Link>
      </footer>
      </main>
  );
}
