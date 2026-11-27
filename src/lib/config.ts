/**
 * Centralized configuration for magic numbers and constants
 * Single source of truth for timeouts, cache durations, and other numeric values
 */

// ============================================================================
// Time Constants (in milliseconds)
// ============================================================================

export const MS_PER_SECOND = 1_000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
export const MS_PER_30_DAYS = 30 * MS_PER_DAY;

// ============================================================================
// Cache Configuration
// ============================================================================

/** Default cache freshness duration (30 seconds) */
export const CACHE_FRESH_MS = 30 * MS_PER_SECOND;

/** Default cache stale duration (60 seconds) */
export const CACHE_STALE_MS = 60 * MS_PER_SECOND;

/** Short cache freshness for user-specific data (15 seconds) */
export const CACHE_FRESH_SHORT_MS = 15 * MS_PER_SECOND;

/** Short cache stale for user-specific data (30 seconds) */
export const CACHE_STALE_SHORT_MS = 30 * MS_PER_SECOND;

/** Next.js revalidate period (30 days in seconds) */
export const REVALIDATE_SECONDS = 30 * 24 * 60 * 60; // 2592000

/** Cache-Control max-age for static assets (30 days in seconds) */
export const CACHE_CONTROL_MAX_AGE = REVALIDATE_SECONDS;

/** Cache-Control header for public catalog data (30 days + 60s SWR) */
export const CATALOG_CACHE_CONTROL = `public, max-age=${REVALIDATE_SECONDS}, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=60`;

// ============================================================================
// Request Timeouts
// ============================================================================

/** Standard API request timeout (15 seconds) */
export const REQUEST_TIMEOUT_MS = 15 * MS_PER_SECOND;

/** Email service timeout (15 seconds) */
export const EMAIL_TIMEOUT_MS = 15 * MS_PER_SECOND;

// ============================================================================
// Intervals
// ============================================================================

/** Default polling/refresh interval (30 seconds) */
export const DEFAULT_POLL_INTERVAL_MS = 30 * MS_PER_SECOND;

/** Purchase status refresh interval (30 seconds) */
export const PURCHASE_REFRESH_INTERVAL_MS = 30 * MS_PER_SECOND;

/** Catalog stale threshold (30 seconds) */
export const CATALOG_STALE_AFTER_MS = 30 * MS_PER_SECOND;

// ============================================================================
// Authentication & Security
// ============================================================================

/** Session profile cache TTL (30 seconds) */
export const SESSION_PROFILE_TTL_MS = 30 * MS_PER_SECOND;

/** Cooldown reset period (24 hours) */
export const COOLDOWN_RESET_PERIOD_MS = MS_PER_DAY;

// ============================================================================
// Rate Limiting Cooldowns (exponential backoff in milliseconds)
// ============================================================================

/** Cooldown table for auth endpoints - index = attempt number - 1 */
export const AUTH_COOLDOWN_TABLE_MS: readonly number[] = Object.freeze([
  30 * MS_PER_SECOND, // 30s  - attempt 2
  5 * MS_PER_MINUTE, // 5m   - attempt 3
  30 * MS_PER_MINUTE, // 30m  - attempt 4
  2 * MS_PER_HOUR, // 2h   - attempt 5
  4 * MS_PER_HOUR, // 4h   - attempt 6
  6 * MS_PER_HOUR, // 6h   - attempt 7
  12 * MS_PER_HOUR, // 12h  - attempt 8+ (capped)
]);

/** Get cooldown for a given attempt number (1-indexed) */
export function getAuthCooldownMs(attemptNumber: number): number {
  const index = Math.min(
    Math.max(attemptNumber - 1, 0),
    AUTH_COOLDOWN_TABLE_MS.length - 1,
  );
  return AUTH_COOLDOWN_TABLE_MS[index];
}

// ============================================================================
// YouTube Configuration
// ============================================================================

/** YouTube itag for 1080p video (no audio) */
export const YOUTUBE_ITAG_1080P = 137;

/** YouTube itag for 720p video (no audio) */
export const YOUTUBE_ITAG_720P = 136;

/** YouTube itag for 480p video (no audio) */
export const YOUTUBE_ITAG_480P = 135;

// ============================================================================
// Email Verification
// ============================================================================

/** Email verification token length */
export const EMAIL_VERIFICATION_TOKEN_LENGTH = 32;

/** Email verification token expiry (24 hours) */
export const EMAIL_VERIFICATION_EXPIRY_MS = MS_PER_DAY;

// ============================================================================
// Password Reset
// ============================================================================

/** Password reset token expiry (1 hour) */
export const PASSWORD_RESET_EXPIRY_MS = MS_PER_HOUR;

/** Minimum password length */
export const MIN_PASSWORD_LENGTH = 8;

// ============================================================================
// Pagination
// ============================================================================

/** Default page size for lists */
export const DEFAULT_PAGE_SIZE = 20;

/** Maximum page size */
export const MAX_PAGE_SIZE = 100;

// ============================================================================
// File Upload
// ============================================================================

/** Maximum file size (5 MB) */
export const MAX_FILE_SIZE_MB = 5;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/** Allowed image MIME types */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

// ============================================================================
// UI Constants
// ============================================================================

/** Debounce delay for search inputs (ms) */
export const SEARCH_DEBOUNCE_MS = 300;

/** Toast notification duration (ms) */
export const TOAST_DURATION_MS = 5_000;

// ============================================================================
// Feature Flags
// ============================================================================

/** Enable YouTube proxy streaming */
export const ENABLE_YOUTUBE_PROXY = process.env.ENABLE_YOUTUBE_PROXY === "true";

/** Enable debug logging */
export const ENABLE_DEBUG_LOGS = process.env.NODE_ENV === "development";
