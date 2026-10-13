"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

type ThemeToggleOrigin = HTMLElement | { x: number; y: number } | undefined;

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: (origin?: ThemeToggleOrigin) => void;
}>({
  theme: "light",
  toggleTheme: () => undefined,
});

function getThemeSnapshot(): Theme {
  if (typeof window === "undefined") return "light";
  const storedTheme = window.localStorage.getItem("propycoder-theme");
  if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getServerThemeSnapshot(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }
  return getThemeSnapshot();
}

function subscribeToTheme(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const followSystemTheme = () => {
    if (!window.localStorage.getItem("propycoder-theme")) onChange();
  };
  media.addEventListener("change", followSystemTheme);
  window.addEventListener("storage", onChange);
  window.addEventListener("propycoder-theme-change", onChange);

  return () => {
    media.removeEventListener("change", followSystemTheme);
    window.removeEventListener("storage", onChange);
    window.removeEventListener("propycoder-theme-change", onChange);
  };
}

// Cubic-bezier easing solver, so the JS-driven ripple below matches the
// lab's `cubic-bezier(0.25, 0.46, 0.45, 0.94)` transition curve exactly.
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  function solveX(x: number) {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (lo < hi) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) return t;
      if (x > v) lo = t;
      else hi = t;
      t = (hi - lo) * 0.5 + lo;
    }
    return t;
  }
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleY(solveX(x));
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

    // The inline ThemeInitScript in <head> already sets the correct
  // data-theme before paint. This keeps it synchronized reactively
  // on the rare path where the initial render didn't set it, but does
  // not force a re-paint-driven flip on the main route.
  useLayoutEffect(() => {
    if (document.documentElement.dataset.theme !== theme) {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  useEffect(() => {
    function receiveLabTheme(event: MessageEvent) {
      const isTrustedLab = Array.from(
        document.querySelectorAll<HTMLIFrameElement>("[data-pycoder-lab]"),
      ).some((frame) => frame.contentWindow === event.source);
      const requestedTheme = event.data?.theme;

      if (
        event.origin !== window.location.origin ||
        !isTrustedLab ||
        event.data?.type !== "propycoder-theme-change" ||
        (requestedTheme !== "light" && requestedTheme !== "dark")
      ) {
        return;
      }

      window.localStorage.setItem("propycoder-theme", requestedTheme);
      document.documentElement.dataset.theme = requestedTheme;
      window.dispatchEvent(new Event("propycoder-theme-change"));
      document
        .querySelectorAll<HTMLIFrameElement>("[data-pycoder-lab]")
        .forEach((frame) => {
          frame.contentWindow?.postMessage(
            { type: "propycoder-theme", theme: requestedTheme },
            window.location.origin,
          );
        });
    }

    window.addEventListener("message", receiveLabTheme);
    return () => window.removeEventListener("message", receiveLabTheme);
  }, []);

  function applyTheme(nextTheme: Theme) {
    window.localStorage.setItem("propycoder-theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.dispatchEvent(new Event("propycoder-theme-change"));
    document
      .querySelectorAll<HTMLIFrameElement>("[data-pycoder-lab]")
      .forEach((frame) => {
        frame.contentWindow?.postMessage(
          { type: "propycoder-theme", theme: nextTheme },
          window.location.origin,
        );
      });
  }

  // Theme-switch ripple, matching the lab's theme-transition behavior:
  // grow a new-theme-colored circle from the toggle click point, flip the
  // palette once it covers the viewport (~200ms into the 400ms expand),
  // then fade the overlay out. Guarded against rapid toggles (stale
  // timeouts for a previous theme never apply), reduced motion, and
  // keyboard activation (falls back to the viewport center).
  const rippleRunId = useRef(0);
  // The overlay currently on screen, if any. A new toggle removes it
  // synchronously — the superseded ripple's rAF loop exits on the run-id
  // guard in playRippleFrame before it can ever reach its own teardown,
  // so without this an opaque full-screen circle stayed stuck over the
  // page whenever the switch was clicked more than once.
  const rippleOverlayRef = useRef<HTMLElement | null>(null);
  // Target requested by the most recent toggle. While a ripple is still
  // in flight the rendered `theme` lags behind (it only flips mid-animation),
  // so the next click chains off this instead — otherwise two fast clicks
  // both compute the same nextTheme and the second click looks ignored.
  const pendingThemeRef = useRef<Theme | null>(null);

  function toggleTheme(origin?: ThemeToggleOrigin) {
    const rippleActive = rippleOverlayRef.current?.isConnected === true;
    const baseline = rippleActive ? (pendingThemeRef.current ?? theme) : theme;
    const nextTheme: Theme = baseline === "light" ? "dark" : "light";
    pendingThemeRef.current = nextTheme;
    const runId = ++rippleRunId.current;

    let point: { x: number; y: number } | null = null;
    if (typeof window === "undefined") {
      applyTheme(nextTheme);
      return;
    }

    // Rapid clicks: retire the previous ripple now so its abandoned loop
    // can't leave a stuck overlay behind, and keep the DevTools marker in
    // sync with the ripple that owns the screen.
    if (rippleOverlayRef.current) {
      rippleOverlayRef.current.remove();
      rippleOverlayRef.current = null;
    }
    if (document.documentElement.dataset.themeRipple === "running") {
      delete document.documentElement.dataset.themeRipple;
    }

    if (origin instanceof HTMLElement) {
      const rect = origin.getBoundingClientRect();
      point = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    } else if (origin) {
      point = { x: origin.x, y: origin.y };
    }

    // NOTE: an earlier version bailed out here when the OS reported
    // prefers-reduced-motion (e.g. Windows Settings > Accessibility >
    // "Animation effects" off). That single guard silently skipped the
    // entire ripple even though every other line was correct — the theme
    // flipped instantly and nothing ever rendered. The ripple is now
    // always played on an explicit user toggle; the stylesheet still
    // shortens the CSS-class-driven twin of this animation for
    // reduced-motion users.
    if (!point) {
      applyTheme(nextTheme);
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "theme-transition-overlay";
    overlay.setAttribute("aria-hidden", "true");
    // Critical paint properties are set inline (mirrored in globals.css)
    // so the ripple renders even if the stylesheet bundle is stale.
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100vw";
    overlay.style.height = "100vh";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "10000";
    overlay.style.opacity = "0";
    overlay.style.transition = "opacity 0.1s ease";

    // Radius big enough to cover the whole screen from the click point.
    const maxDistance = Math.sqrt(
      Math.pow(Math.max(point.x, window.innerWidth - point.x), 2) +
        Math.pow(Math.max(point.y, window.innerHeight - point.y), 2),
    );
    const circle = document.createElement("div");
    circle.className = "theme-circle";
    // .theme-circle carries a 0.4s transform transition for the
    // CSS-class-driven twin of this animation; it must not fight the
    // per-frame absolute scales written by the loop below.
    circle.style.transition = "none";
    circle.style.position = "absolute";
    circle.style.borderRadius = "50%";
    // No CSS transition on purpose: the rAF loop below sets an absolute
    // scale every frame, so a transition would lag each step behind the
    // loop (and the global reduced-motion clamp would kill it anyway).
    circle.style.transform = "scale(0)";
    circle.style.left = `${point.x}px`;
    circle.style.top = `${point.y}px`;
    circle.style.width = `${maxDistance * 2}px`;
    circle.style.height = `${maxDistance * 2}px`;
    circle.style.marginLeft = `${-maxDistance}px`;
    circle.style.marginTop = `${-maxDistance}px`;
    circle.style.background =
      nextTheme === "light"
        ? "linear-gradient(135deg, #f8f8f5 0%, #ffffff 100%)"
        : "linear-gradient(135deg, #0c0c0e 0%, #232329 100%)";

    overlay.appendChild(circle);
    document.body.appendChild(overlay);
    rippleOverlayRef.current = overlay;
    overlay.style.opacity = "1";
    // Mark the document while the ripple plays so the animation can be
    // verified in DevTools (the attribute is present for ~0.5s after a
    // toggle click).
    document.documentElement.dataset.themeRipple = "running";

    // NOTE: this animation is driven frame-by-frame in JS on purpose.
    // globals.css contains a blanket `prefers-reduced-motion` rule that
    // pins every CSS transition to `0.01ms !important` — !important beats
    // inline styles, so a transition-based circle renders instantly at
    // full size (a full-screen flash) whenever the OS reports
    // reduced-motion. Individual rAF style writes are unaffected by that
    // rule and always paint, so the ripple now plays the same 400ms
    // expand / flip-at-half / 100ms fade as the lab, driven by this loop.
    const easeRipple = cubicBezier(0.25, 0.46, 0.45, 0.94);
    const EXPAND_MS = 400;
    const FLIP_MS = 200;
    const FADE_MS = 100;
    let flipped = false;
    const startTime = performance.now();

    function playRippleFrame(now: number) {
      if (rippleRunId.current !== runId || !circle.isConnected) return;
      const elapsed = now - startTime;
      const expandProgress = Math.min(elapsed / EXPAND_MS, 1);
      circle.style.transform = `scale(${easeRipple(expandProgress)})`;

      // Flip the palette once the circle covers the viewport.
      if (!flipped && elapsed >= FLIP_MS) {
        flipped = true;
        if (rippleRunId.current === runId) applyTheme(nextTheme);
      }

      if (expandProgress < 1) {
        requestAnimationFrame(playRippleFrame);
        return;
      }

      // Expansion finished — fade the overlay out, then tear down.
      overlay.style.transition = "opacity 0.1s ease";
      overlay.style.opacity = "0";
      setTimeout(() => {
        overlay.remove();
        if (rippleOverlayRef.current === overlay) {
          rippleOverlayRef.current = null;
        }
        // Only the ripple that still owns the screen may clear the marker;
        // a newer one may already be running.
        if (
          rippleRunId.current === runId &&
          document.documentElement.dataset.themeRipple === "running"
        ) {
          delete document.documentElement.dataset.themeRipple;
        }
      }, FADE_MS);
    }
    requestAnimationFrame(playRippleFrame);
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
