"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { ArrowLeft, Download, LoaderCircle } from "lucide-react";
import html2canvas from "html2canvas";

interface CertificateView {
  id: string;
  course: string;
  issueDate: string;
  certificateNumber: string;
  student: { firstName: string; lastName: string };
}

export default function CertificateViewPage() {
  const params = useParams<{ id: string }>();
  const certificateId = params?.id ?? null;
  const [certificate, setCertificate] = useState<CertificateView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const load = useCallback(async () => {
    if (!certificateId) return;
    try {
      const response = await fetch(`/api/certificates/${certificateId}`);
      if (response.ok) {
        const data = await response.json();
        setCertificate(data);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [certificateId]);

  // Download the certificate as a PNG image of exactly the certificate
  // frame (no buttons, no page chrome).
  const downloadImage = async () => {
    const element = document.getElementById("certificate");
    if (!element || isDownloading) return;
    setIsDownloading(true);
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        // html2canvas renders absolute children slightly differently than the
        // browser, so the wordmark needs a small lift ONLY while exporting.
        // `onclone` lets us add the `is-exporting` class to the cloned node
        // without ever affecting the on-screen certificate view.
        onclone: (_doc, clonedElement) => {
          if (clonedElement) clonedElement.classList.add("is-exporting");
        },
      });
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("Could not render the certificate image");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ProPyCoder-Certificate-${certificate?.certificateNumber ?? "certificate"}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Certificate downloaded");
    } catch (error) {
      console.error("Certificate image download error:", error);
      toast.error("Could not download the certificate. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    if (certificateId) {
      void load();
    }
  }, [load, certificateId]);

  if (isLoading) {
    return (
      <div className="certificate-view">
        <Navbar />
        <main className="certificate-view-main">
          <div className="certificate-view-spinner">
            <LoaderCircle
              className="animate-spin"
              size={28}
              style={{ margin: "0 auto", color: "#e95f32" }}
            />
          </div>
        </main>
      </div>
    );
  }

  if (notFound || !certificate) {
    return (
      <div className="certificate-view">
        <Navbar />
        <main className="certificate-view-main">
          <div className="certificate-view-card">
            <Link
              href="/certificates"
              className="certificate-view-back"
              onClick={() => setIsLoading(false)}
            >
              <ArrowLeft size={18} /> Back to certificates
            </Link>
            <h1>Certificate not found</h1>
            <p className="certificate-view-description">
              This certificate does not exist.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="certificate-view">
      <Navbar />
      <main className="certificate-view-main">
        <div className="certificate">
          <div id="certificate" className="certificate-frame">
            <span className="certificate-emblem certificate-medal" aria-hidden="true">
              <svg
                viewBox="0 0 72 96"
                width="76"
                height="101"
                role="img"
                aria-label="Award medal"
              >
                <defs>
                  <linearGradient id="ppcRibbonL" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#e0452f" />
                    <stop offset="1" stopColor="#a82618" />
                  </linearGradient>
                  <linearGradient id="ppcRibbonR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#f0703f" />
                    <stop offset="1" stopColor="#cf461f" />
                  </linearGradient>
                  <radialGradient id="ppcGold" cx="0.35" cy="0.3" r="0.9">
                    <stop offset="0" stopColor="#fff3c4" />
                    <stop offset="0.55" stopColor="#f2c75c" />
                    <stop offset="1" stopColor="#c8891a" />
                  </radialGradient>
                </defs>
                {/* ribbons forming a shallow V behind the medal */}
                <polygon points="19,2 32,2 35,56 25,56" fill="url(#ppcRibbonL)" />
                <polygon points="40,2 53,2 47,56 37,56" fill="url(#ppcRibbonR)" />
                <polygon points="19,2 32,2 33,26 20,26" fill="#ffffff" opacity="0.18" />
                <polygon points="40,2 53,2 52,26 39,26" fill="#ffffff" opacity="0.14" />
                {/* medal rim + disc */}
                <circle cx="36" cy="62" r="30" fill="#b9801a" />
                <circle cx="36" cy="62" r="30" fill="none" stroke="#8f6212" strokeWidth="1" />
                <circle cx="36" cy="62" r="26" fill="url(#ppcGold)" />
                {/* engraved inner ring */}
                <circle cx="36" cy="62" r="21" fill="none" stroke="#d9a52a" strokeWidth="1.4" opacity="0.55" />
                {/* sheen */}
                <ellipse cx="27" cy="51" rx="11" ry="6.5" fill="#ffffff" opacity="0.28" transform="rotate(-24 27 51)" />
                {/* center star */}
                <polygon
                  points="36,49 39.29,57.47 48.36,57.98 41.33,63.73 43.64,72.52 36,67.6 28.36,72.52 30.67,63.73 23.64,57.98 32.71,57.47"
                  fill="#fffdf3"
                  stroke="#e0a020"
                  strokeWidth="0.6"
                />
              </svg>
            </span>
            <div className="certificate-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/propycoder-logo.png" alt="ProPyCoder" />
              <div className="site-brand">ProPyCoder</div>
            </div>
            <div className="certificate-eyebrow">CERTIFICATE OF COMPLETION</div>
            <h1 className="certificate-title">{certificate.course}</h1>
            <p className="certificate-awarded">This certificate is awarded to</p>
            <p className="certificate-name">
              {certificate.student.firstName} {certificate.student.lastName}
            </p>
            <p className="certificate-text">
              for successfully completing all lessons and requirements of the
              course.
            </p>
            <div className="certificate-footer">
              <div>
                <span className="certificate-label">Issue date</span>
                <strong>
                  {new Date(certificate.issueDate).toLocaleDateString()}
                </strong>
              </div>
              <div>
                <span className="certificate-label">Certificate no.</span>
                <strong>{certificate.certificateNumber}</strong>
              </div>
            </div>
          </div>

          <div className="certificate-actions">
            <Link href="/certificates" className="auth-submit">
              All certificates
            </Link>
            <button
              type="button"
              className="auth-submit"
              onClick={downloadImage}
              disabled={isDownloading}
            >
              <Download size={16} />
              {isDownloading ? "Preparing image…" : "Download"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
