"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface HomeSessionSyncProps {
  initialAuthenticated: boolean;
}

/**
 * The home page is a Server Component whose "Purchased" badges are baked into
 * the RSC payload. The Router Cache can keep a logged-out version around after
 * sign-in, so courses/bundles (which fetch ownership client-side) update but
 * the home page does not. Refresh the server payload only when the client ends
 * up authenticated but the server render was not, i.e. a stale logged-out shell.
 */
export function HomeSessionSync({ initialAuthenticated }: HomeSessionSyncProps) {
  const router = useRouter();
  const { status } = useSession();
  const refreshedRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (initialAuthenticated) return;
    if (refreshedRef.current) return;
    refreshedRef.current = true;
    router.refresh();
  }, [status, initialAuthenticated, router]);

  return null;
}
