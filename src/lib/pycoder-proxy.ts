import { NextRequest, NextResponse } from "next/server";

const upstream = "https://propycoder.pythonanywhere.com";

export async function proxyPyCoderStatic(pathSegments: string[]) {
  if (
    pathSegments.some((segment) => segment === ".." || segment.includes("\\"))
  ) {
    return new NextResponse("Invalid asset path", { status: 400 });
  }

  try {
    const assetPath = pathSegments.map(encodeURIComponent).join("/");
    const response = await fetch(`${upstream}/static/${assetPath}`, {
      cache: "force-cache",
      next: { revalidate: 3600 },
    });
    if (!response.ok) {
      return new NextResponse("PyCoder asset not found", { status: 404 });
    }

    return new NextResponse(response.body, {
      headers: {
        "Content-Type":
          response.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (error) {
    console.error("PyCoder asset proxy error:", error);
    return new NextResponse("Failed to load PyCoder asset", { status: 502 });
  }
}

export async function proxyPyCoderPage(request: NextRequest, pathname: string) {
  try {
    const route = pathname.startsWith("/") ? pathname : `/${pathname}`;
    if (route === "/admin-login") {
      return NextResponse.redirect(`${upstream}/admin-login`);
    }

            const revalidator = request.nextUrl.searchParams.get("revalidate");
    // Drop internal-only query params before forwarding upstream so the lab
    // never sees ?preload=1 in its URL.
    const searchParams = new URLSearchParams(request.nextUrl.search);
    searchParams.delete("preload");
    searchParams.delete("revalidate");
    const search = searchParams.toString();
    const fetchUrl = `${upstream}${route}${search ? `?${search}` : ""}`;

    const response = await fetch(fetchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      redirect: "follow",
      // Shared cache so switching back to the lab serves the warm shell
      // instead of re-hitting PythonAnywhere. Run/code endpoints are
      // separate routes with their own handlers, so this HTML shell is
      // safe to cache (nav links inside are rewritten to relative proxy
      // paths, so a cached copy behaves identically).
      next: { revalidate: revalidator ? Number(revalidator) : 600 },
    });

    if (!response.ok) {
      return new NextResponse("PyCoder page not found", { status: 404 });
    }

    let html = await response.text();
    html = html.replace(/<meta http-equiv="refresh"[^>]*>/gi, "");
    html = html.replace(
      'class="max-w-3xl mx-auto mt-10 bg-white rounded-xl shadow-2xl p-8"',
      'class="max-w-3xl mx-auto mt-2 bg-transparent rounded-none shadow-none p-3 md:p-4 lab-workspace"',
    );
    html = html.replace(
      /<div class="flex justify-between items-center mb-6">[\s\S]*?<a[^>]*admin-login[^>]*>[\s\S]*?<\/a>\s*<\/div>\s*<\/div>/i,
      '<div class="lab-window-controls" aria-label="Workspace window controls"><span id="title" style="display:none!important" aria-hidden="true">PyCoder</span><span id="subtitle" style="display:none!important" aria-hidden="true">Write, compile, and run code in any language!</span><span class="lab-window-dot is-close" title="Close" aria-hidden="true"></span><span class="lab-window-dot is-minimize" title="Minimize" aria-hidden="true"></span><span class="lab-window-dot is-maximize" title="Maximize" aria-hidden="true"></span></div>',
    );
    html = html.replace(
      /window\.location(?:\.href)?\s*=\s*["'][^"']*["']/g,
      "",
    );
    html = html.replace(/window\.location\.replace\s*\([^)]*\)/g, "");
    html = html.replace(/document\.location\s*=\s*["'][^"']*["']/g, "");
    html = html.replace(/\/static\//g, "/api/pycoder/static/");
    html = html.replace(/\/api\/questions\//g, "/api/pycoder/questions/");
    html = html.replace(
      /\/api\/questions([^\/])/g,
      "/api/pycoder/questions/$1",
    );
    html = html.replace(/\/check_syntax\//g, "/api/pycoder/check_syntax/");
    html = html.replace(/\/run_code\//g, "/api/pycoder/run_code/");
    html = html.replace(
      /https:\/\/propycoder\.pythonanywhere\.com\/admin-login/g,
      "/",
    );
    html = html.replace(
      /href=(["'])\/pycoder\/?([^"']*)\1/gi,
      (_match, quote: string, path: string) =>
        `href=${quote}/api/pycoder/proxy/${path}${quote}`,
    );
    html = html.replace(
      /href=(["'])\/(?!\/|static\/|api\/)([^"']*)\1/gi,
      (_match, quote: string, path: string) =>
        path
          ? `href=${quote}/api/pycoder/proxy/${path}${quote}`
          : `href=${quote}/${quote} target=${quote}_top${quote}`,
    );

    const themeBridge = `<style>
  .lab-window-controls{display:flex;align-items:center;gap:8px;height:30px;margin:0 12px 8px;padding:0 2px 8px;border-bottom:1px solid rgba(125,130,140,.2)}
  .lab-window-dot{display:block;width:11px;height:11px;border:1px solid rgba(0,0,0,.08);border-radius:50%;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
  .lab-window-dot.is-close{background:#ed6a5f}
  .lab-window-dot.is-minimize{background:#edbd4f}
  .lab-window-dot.is-maximize{background:#9298a2}
  .lab-workspace{max-width:1120px!important;margin:0 auto!important;padding:10px 18px 24px!important;background:transparent!important;box-shadow:none!important;border-radius:0!important}
  .max-w-3xl{margin-top:0!important;padding:0 12px 18px!important;background:transparent!important;box-shadow:none!important;border-radius:0!important}
  @media(max-width:640px){.lab-workspace{padding:8px 12px 18px!important}.lab-window-controls{height:25px;margin:0 12px 5px;padding-bottom:6px}}
  </style><style>
 button[id="runCode"],  div[class="flex items-center space-x-3"] {
  display: none !important;
}
</style>`;
    html = html.replace(/<\/head>/i, `${themeBridge}</head>`);

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Long browser cache: the lab shell is identical between visits;
        // lab navigation then paints instantly from disk cache.
        "Cache-Control": `public, max-age=300, s-maxage=600, stale-while-revalidate=600`,
      },
    });
  } catch (error) {
    console.error("PyCoder proxy error:", error);
    return new NextResponse("Failed to load PyCoder", { status: 502 });
  }
}
