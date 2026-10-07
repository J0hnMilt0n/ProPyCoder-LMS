"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
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

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
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

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
