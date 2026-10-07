// Hardcoded lesson video sources.
// Entries are base64-encoded "videoId|url" pairs so plain URLs never appear
// in the source tree. Decoded lazily on the client at playback time.
// NOTE: this is obfuscation, not DRM — anything the browser loads can still
// be found in DevTools' Network tab. For real protection, serve signed URLs
// from an authenticated route handler.
const ENTRIES: string[] = [
  "UGx4V2Y0OTNlbjR8aHR0cHM6Ly9tZWRpYS53My5vcmcvMjAxMC8wNS9zaW50ZWwvdHJhaWxlci5tcDQ=",
  "a1VNZTFGSDRDSEV8aHR0cHM6Ly9tZWRpYS53My5vcmcvMjAxMC8wNS9idW5ueS9tb3ZpZS5tcDQ=",
  "Zk5jSnVQSVoyV0V8aHR0cHM6Ly9tZWRpYS53My5vcmcvMjAxMC8wNS92aWRlby9tb3ZpZV8zMDAubXA0",
  "MVJzMk5EMXJ5WWN8aHR0cHM6Ly93d3cudzNzY2hvb2xzLmNvbS9odG1sL21vdl9iYmIubXA0",
  "ZllxNVBYZ1NzYkV8aHR0cHM6Ly9pbnRlcmFjdGl2ZS1leGFtcGxlcy5tZG4ubW96aWxsYS5uZXQvbWVkaWEvY2MwLXZpZGVvcy9mbG93ZXIubXA0",
  "alY4QjI0clNONW98aHR0cHM6Ly9pbnRlcmFjdGl2ZS1leGFtcGxlcy5tZG4ubW96aWxsYS5uZXQvbWVkaWEvY2MwLXZpZGVvcy9mcmlkYXkubXA0",
  "V0JQckpTdzd5UUF8aHR0cHM6Ly90ZXN0LXZpZGVvcy5jby51ay92aWRzL2JpZ2J1Y2tidW5ueS9tcDQvaDI2NC8zNjAvQmlnX0J1Y2tfQnVubnlfMzYwXzEwc18xTUIubXA0",
  "eFVJNVRzbDJKcFl8aHR0cHM6Ly90ZXN0LXZpZGVvcy5jby51ay92aWRzL3NpbnRlbC9tcDQvaDI2NC8zNjAvU2ludGVsXzM2MF8xMHNfMU1CLm1wNA==",
  "eTE3UnVXa1dkbjh8aHR0cHM6Ly90ZXN0LXZpZGVvcy5jby51ay92aWRzL2plbGx5ZmlzaC9tcDQvaDI2NC8zNjAvSmVsbHlmaXNoXzM2MF8xMHNfMU1CLm1wNA==",
  "ZGVmYXVsdHxodHRwczovL3Rlc3QtdmlkZW9zLmNvLnVrL3ZpZHMvYmlnYnVja2J1bm55L21wNC9oMjY0LzcyMC9CaWdfQnVja19CdW5ueV83MjBfMTBzXzFNQi5tcDQ=",
];

let table: Map<string, string> | null = null;

function getTable(): Map<string, string> {
  if (table) return table;
  table = new Map();
  for (const entry of ENTRIES) {
    try {
      const decoded = atob(entry);
      const separator = decoded.indexOf("|");
      if (separator <= 0) continue;
      table.set(decoded.slice(0, separator), decoded.slice(separator + 1));
    } catch {
      // Skip malformed entries instead of breaking playback for the rest.
    }
  }
  return table;
}

/**
 * Resolves the direct (non-YouTube) video URL for a lesson's videoId.
 * Unknown ids fall back to the default sample so the player always works.
 */
export function getLessonVideoSource(
  videoId: string | null | undefined,
): string | null {
  if (!videoId) return null;
  const map = getTable();
  return map.get(videoId) ?? map.get("default") ?? null;
}
