/**
 * Tiny in-memory stale-while-revalidate cache for read-heavy API payloads.
 *
 * The database lives in another region, so every query costs a network
 * round trip. Fresh hits skip the database entirely; stale hits are served
 * instantly while a single deduplicated reload runs in the background, so
 * the next request gets fresh data without anyone waiting on it.
 *
 * This is a best-effort, per-process cache: each server instance warms
 * independently, which is exactly the repeated-read traffic it absorbs.
 */

interface CacheEntry {
  value: unknown;
  freshUntil: number;
  staleUntil: number;
}

export interface CacheOptions {
  /** How long a value is served without touching the database. */
  freshMs: number;
  /** Extra window where a stale value may be served while revalidating. */
  staleMs: number;
}

const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
// Bumped on invalidation so a load that started before a write can never
// repopulate the cache with pre-write data when it finishes.
const generations = new Map<string, number>();
const MAX_ENTRIES = 500;

function evictIfNeeded(): void {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.staleUntil <= now) store.delete(key);
  }
  // Still over budget — drop oldest entries (Map preserves insert order).
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

async function runLoad<T>(
  key: string,
  load: () => Promise<T>,
  opts: CacheOptions,
): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>; // dedupe concurrent loads

  const generation = generations.get(key) ?? 0;
  const promise = (async () => {
    try {
      const value = await load();
      if ((generations.get(key) ?? 0) === generation) {
        store.set(key, {
          value,
          freshUntil: Date.now() + opts.freshMs,
          staleUntil: Date.now() + opts.freshMs + opts.staleMs,
        });
        evictIfNeeded();
      }
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

/**
 * Return the cached value for `key`, loading it on a miss.
 *
 * - fresh hit  → returned immediately, database untouched
 * - stale hit  → stale value returned immediately while ONE background
 *                reload refreshes the entry (stale-while-revalidate)
 * - miss       → awaited load (concurrent callers share the same load)
 */
export async function cached<T>(
  key: string,
  load: () => Promise<T>,
  opts: CacheOptions,
): Promise<T> {
  const entry = store.get(key);
  const now = Date.now();
  if (entry) {
    if (entry.freshUntil > now) return entry.value as T;
    if (entry.staleUntil > now) {
      void runLoad(key, load, opts).catch(() => undefined);
      return entry.value as T;
    }
  }
  return runLoad(key, load, opts);
}

/**
 * Warm a key in the background without blocking the caller — used to
 * preload likely-next requests (e.g. course details after a catalog load).
 */
export function preload<T>(
  key: string,
  load: () => Promise<T>,
  opts: CacheOptions,
): void {
  const entry = store.get(key);
  if (entry && entry.freshUntil > Date.now()) return; // already warm
  void runLoad(key, load, opts).catch(() => undefined);
}

/**
 * Drop every key equal to `prefix` or starting with it, and make sure any
 * load already in flight for those keys cannot write back pre-invalidation
 * data. Id-scoped keys must end with a delimiter (e.g. `course:<id>:`) so
 * one cuid can never accidentally match another sharing its prefix.
 */
export function invalidate(prefix: string): void {
  const matches = (key: string) => key === prefix || key.startsWith(prefix);
  for (const key of [...store.keys()]) {
    if (matches(key)) store.delete(key);
  }
  for (const key of [...inflight.keys()]) {
    if (matches(key)) {
      generations.set(key, (generations.get(key) ?? 0) + 1);
    }
  }
}
