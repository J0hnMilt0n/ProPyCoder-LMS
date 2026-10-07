import Script from "next/script";

// SSR-inert script that sets <html data-theme=...> before CSS paint,
// preventing the dark->light theme flash on first paint.
// Reads the same source of truth as the client ThemeProvider.
// Must use next/script (beforeInteractive) — a raw <script> rendered by a
// React component is never executed on client renders.
export function ThemeInitScript() {
  return (
    <Script
      id="propycoder-theme-init"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{
        __html: `
(function(){
  try {
    var stored = window.localStorage.getItem('propycoder-theme');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
  } catch (e) {}
})();
`,
      }}
    />
  );
}
