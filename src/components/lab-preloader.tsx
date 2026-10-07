"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * Warms up the PyCoder lab (Next proxy + upstream PythonAnywhere + iframe JS/CSS)
 * in a hidden background iframe, after idle, so opening /pycoder is
 * effectively instant. Runs for everyone — the lab is public.
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

    const fire = () => {
      if (fired) return;
      fired = true;

      // Kick off the Next-side route prefetch in parallel.
      router.prefetch("/pycoder");

      // Mount hidden iframe to warm proxy + upstream + iframe JS/CSS.
      // ?preload=1 is stripped by the proxy before forwarding upstream.
      setIframeSrc("/api/pycoder/proxy?preload=1");
    };

    const onIdle =
      (window as Window & {
        requestIdleCallback?: (cb: () => void) => void;
      }).requestIdleCallback ||
      ((cb: () => void) => setTimeout(cb, 3000));

    const idleId = onIdle(fire);
    const timeoutId = setTimeout(fire, 6000);

    return () => {
      clearTimeout(timeoutId);
      if (idleId && typeof idleId === "number") clearTimeout(idleId);
      // (requestIdleCallback id not cancelable portably, no-op)
      setIframeSrc(null);
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
