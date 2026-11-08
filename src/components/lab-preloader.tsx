"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * Warms up the PyCoder lab (Next proxy + upstream PythonAnywhere + iframe JS/CSS)
 * in a hidden background iframe after the user shows intent to open /pycoder.
 *
 * Honors:
 *  - data-saver / slow-2g (skips)
 *  - already on the lab (skips)
 *  - prior warm in this tab (skips via sessionStorage; the flag is only
 *    written after the warm load actually succeeds, so a failed warm retries)
 */
export function LabPreloader() {
  const router = useRouter();
  const pathname = usePathname();
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);

  useEffect(() => {
    // Don't preload if we're looking at the lab itself.
    if (pathname === "/pycoder" || pathname?.startsWith("/pycoder/")) return;

    // Honor data-saver / cheap connections.
    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    };
    if (nav.connection?.saveData) return;
    if (nav.connection?.effectiveType === "slow-2g" || nav.connection?.effectiveType === "2g")
      return;

    // Only warm once per tab session.
    if (sessionStorage.getItem("pycoder-lab-warmed")) return;

    let fired = false;
    const warmOnIntent = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      const href = link?.getAttribute("href");
      if (href !== "/pycoder" && !href?.startsWith("/pycoder/")) return;
      if (fired) return;
      fired = true;
      document.removeEventListener("pointerover", warmOnIntent);
      document.removeEventListener("focusin", warmOnIntent);

      // Kick off the Next-side route prefetch in parallel.
      router.prefetch("/pycoder");

      // Mount hidden iframe to warm proxy + upstream + iframe JS/CSS.
      // ?preload=1 is stripped by the proxy before forwarding upstream.
      setIframeSrc("/api/pycoder/proxy?preload=1");
      window.setTimeout(() => setIframeSrc(null), 15_000);
    };

    document.addEventListener("pointerover", warmOnIntent, { passive: true });
    document.addEventListener("focusin", warmOnIntent);

    return () => {
      document.removeEventListener("pointerover", warmOnIntent);
      document.removeEventListener("focusin", warmOnIntent);
    };
  }, [pathname, router]);

  if (!iframeSrc) return null;

  return (
    <iframe
      src={iframeSrc}
      aria-hidden="true"
      tabIndex={-1}
      title="PyCoder lab preloader"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "1px",
        height: "1px",
        opacity: 0,
        pointerEvents: "none",
        border: 0,
        zIndex: -1,
      }}
      onLoad={() => {
        // Mark the warm as successful only now, so a failed attempt can
        // retry later in the session instead of never warming at all.
        try {
          sessionStorage.setItem("pycoder-lab-warmed", "1");
        } catch {
          // Storage unavailable.
        }
        // Once the warm iframe has fully loaded, drop it after a short grace
        // period to free memory while keeping the upstream session hot.
        setTimeout(() => setIframeSrc(null), 6000);
      }}
    />
  );
}
