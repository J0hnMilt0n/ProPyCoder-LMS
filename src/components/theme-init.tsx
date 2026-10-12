// Blocking inline <script> that sets <html data-theme=...> synchronously
// during HTML parsing — i.e. BEFORE the body is ever painted. This is what
// prevents the white→dark flash on first load when dark mode is enabled.
//
// Why not next/script beforeInteractive? Per the Next.js docs, beforeInteractive
// scripts "do not block page hydration from occurring", so the browser can paint
// the light `:root` colors for a frame before the script flips to dark. A raw
// inline script placed directly in <head> runs before first paint, eliminating
// the flash. (On client-side navigations the script is not re-run, but that is
// fine: data-theme already persists on <html> and ThemeProvider keeps it in sync.)
//
// Reads the same source of truth as the client ThemeProvider.
export function ThemeInitScript() {
  return (
    <script
      id="propycoder-theme-init"
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var s=window.localStorage.getItem('propycoder-theme');var t=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;}catch(e){}})();`,
      }}
    />
  );
}
