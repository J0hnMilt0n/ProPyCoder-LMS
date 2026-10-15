"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Client-side stale-while-revalidate data hook.
 *
 * Pages that read from the server used to show a spinner on every mount and
 * block on a network round trip. This hook flips that around:
 *
 *  1. PAINT FIRST — a cached copy (per user + resource) is read from
 *     localStorage synchronously during the first render, so the page shows
 *     real content immediately instead of a loading state — even after the
 *     tab was closed and reopened (entries expire after 24h so a page that
 *     hasn't been visited in a while can't serve ancient data).
 *  2. FETCH IN BACKGROUND — a fresh request runs right after mount (and again
 *     whenever the window regains focus, to pick up changes made elsewhere).
 *  3. PATCH ONLY WHAT CHANGED — the fresh payload is compared to what's shown;
 *     setState is called ONLY when it actually differs, so React re-renders
 *     just the changed nodes instead of flashing the whole page.
 *
 * `isLoading` is true only when there is nothing to show yet (no cache); while
 * a background refresh runs with cached data visible, `isRevalidating` is true
 * instead — the UI can show a subtle "updating" hint without hiding content.
 */

const PREFIX = "propycoder-resource:";
// Entries older than this are ignored (the next page load refreshes them).
// Writes invalidate server-side immediately, so this is only a safety bound.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEnvelope<T> {
  v: 1;
  scope: string;
  savedAt: number;
  data: T;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readCache<T>(key: string, scope: string): T | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    // Ignore a cache entry left by a different user (e.g. after account switch
    // on a shared browser) so one user's data is never shown to another.
    if (parsed.scope !== scope) return null;
    if (
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > CACHE_TTL_MS
    ) {
      try {
        store.removeItem(PREFIX + key);
      } catch {
        // Best-effort cleanup.
      }
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * Read one resource-cache entry (per-user keyed). Exposed so intrinsically
 * complex pages (e.g. course detail) can prime state synchronously on first
 * paint and then revalidate piece-by-piece in the background.
 */
export function readResourceCache<T>(key: string, scope: string): T | null {
  return readCache<T>(key, scope);
}

function writeCache<T>(key: string, scope: string, data: T): void {
  const store = storage();
  if (!store) return;
  const envelope: CacheEnvelope<T> = {
    v: 1,
    scope,
    savedAt: Date.now(),
    data,
  };
  try {
    store.setItem(PREFIX + key, JSON.stringify(envelope));
  } catch {
    // Quota/full — evict expired resource entries once, then retry.
    try {
      for (let i = store.length - 1; i >= 0; i--) {
        const k = store.key(i);
        if (!k || !k.startsWith(PREFIX)) continue;
        try {
          const parsed = JSON.parse(
            store.getItem(k) ?? "",
          ) as CacheEnvelope<unknown>;
          if (Date.now() - (parsed?.savedAt ?? 0) > CACHE_TTL_MS) {
            store.removeItem(k);
          }
        } catch {
          store.removeItem(k);
        }
      }
      store.setItem(PREFIX + key, JSON.stringify(envelope));
    } catch {
      // Storage unavailable — caching is best-effort.
    }
  }
}

/**
 * Drop every cached resource payload (per-user entries included). Call it on
 * sign-out so the next account on a shared machine never inherits data.
 */
export function clearResourceCaches(): void {
  const store = storage();
  if (!store) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(PREFIX)) doomed.push(k);
    }
    for (const k of doomed) store.removeItem(k);
  } catch {
    // Best-effort.
  }
}

/**
 * Write a resource payload straight into the client cache without fetching.
 * Used by the background route preloader so a page the user opens later
 * paints instantly from cache on its very first mount.
 */
export function primeResourceCache<T>(
  key: string,
  scope: string,
  data: T,
): void {
  writeCache(key, scope, data);
}

/** Stable stringify for change detection (key order is consistent per API). */
function stable(value: unknown): string {
  return JSON.stringify(value);
}

export interface UseResourceOptions {
  /** Storage key for this resource (unique per page/endpoint). */
  key: string;
  /** URL to fetch. */
  url: string;
  /**
   * Scope that isolates the cache — pass the user id (or "" for shared/public
   * data). A change in scope clears the shown data so a different user never
   * sees the previous user's cached content.
   */
  scope: string;
  /** Gate the fetch (e.g. wait until the session is authenticated). */
  enabled?: boolean;
  /** Re-fetch when the tab/window regains focus. Default true. */
  revalidateOnFocus?: boolean;
  /** Transform the parsed JSON into the value the page needs. */
  select?: (json: unknown) => unknown;
}

export interface UseResourceResult<T> {
  data: T | null;
  /** True only when there is nothing to show yet (no usable cache). */
  isLoading: boolean;
  /** True while a background refresh runs with cached content already visible. */
  isRevalidating: boolean;
  error: boolean;
  /** Force an immediate refresh (still patches only on change). */
  refresh: () => void;
}

export function useResource<T>(options: UseResourceOptions): UseResourceResult<T> {
  const {
    key,
    url,
    scope,
    enabled = true,
    revalidateOnFocus = true,
    select,
  } = options;

  // Prime from cache synchronously so the very first paint has content.
  const [data, setData] = useState<T | null>(() =>
    enabled ? readCache<T>(key, scope) : null,
  );
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState(false);

  // Track what's currently shown so we only setState on a real change.
  const shownRef = useRef<string>(data === null ? "" : stable(data));
  const activeScopeRef = useRef(scope);
  // Latest transform held by ref so the fetcher below stays referentially
  // stable and effects depending on it don't re-fire on render.
  const selectRef = useRef(select);
  selectRef.current = select;
  // One fetch per hook instance at a time — an in-flight guard so rapid
  // re-renders (scroll, theme, parent updates) can never stack up requests.
  // Each running request still completes; later triggers just don't start a
  // second one on top.
  const inFlightRef = useRef(false);

  const load = useCallback(
    async (background: boolean) => {
      if (!enabled) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (background) setIsRevalidating(true);
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Request failed");
        const json = await response.json();
        const next = (selectRef.current
          ? selectRef.current(json)
          : json) as T;
        const signature = stable(next);
        // Patch only when the payload actually changed — this is what keeps a
        // background refresh from re-rendering the whole page.
        if (signature !== shownRef.current) {
          shownRef.current = signature;
          setData(next);
          writeCache(key, scope, next);
        }
        setError(false);
      } catch {
        // Keep showing cached content on a failed background refresh; only
        // surface an error when we truly have nothing to show.
        if (shownRef.current === "") setError(true);
      } finally {
        inFlightRef.current = false;
        if (background) setIsRevalidating(false);
      }
    },
    [enabled, url, key, scope],
  );

  // Reset when the scope (user) changes so a different user starts clean.
  useEffect(() => {
    if (activeScopeRef.current === scope) return;
    activeScopeRef.current = scope;
    const cached = enabled ? readCache<T>(key, scope) : null;
    shownRef.current = cached === null ? "" : stable(cached);
    setData(cached);
    setError(false);
  }, [scope, key, enabled]);

  // Initial (and per-scope) fetch. With no cache this is the first paint's
  // blocking load; otherwise it's a silent background refresh.
  useEffect(() => {
    if (!enabled) return;
    const hadCache = shownRef.current !== "";
    void load(hadCache);
  }, [enabled, url, scope, load]);

  // Revalidate on focus to pick up changes made in other tabs / by staff.
  useEffect(() => {
    if (!enabled || !revalidateOnFocus || typeof window === "undefined") return;
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, revalidateOnFocus, load]);

  const refresh = useCallback(() => {
    void load(shownRef.current !== "");
  }, [load]);

  // "Loading" only means there's genuinely nothing to show yet. Once the
  // first load settles — success or a hard failure with no cache — it flips
  // false so the page can render (with its own empty/error state) instead of
  // spinning forever.
  const isLoading = data === null && !isRevalidating && !error;

  return { data, isLoading, isRevalidating, error, refresh };
}
