import { NextRequest, NextResponse } from "next/server";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store (for single instance; use Redis for multi-instance)
const store = new Map<string, RateLimitEntry>();

/**
 * Clean up expired entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetTime < now) {
      store.delete(key);
    }
  }
}, 60_000); // Clean every minute

/**
 * Rate limiter middleware for API routes
 */
export function rateLimit(config: RateLimitConfig) {
  return async function rateLimitMiddleware(
    request: NextRequest,
    handler: () => Promise<NextResponse>,
  ): Promise<NextResponse> {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const key = `${config.keyPrefix}:${ip}`;
    const now = Date.now();

    let entry = store.get(key);

    if (!entry || entry.resetTime < now) {
      entry = { count: 0, resetTime: now + config.windowMs };
      store.set(key, entry);
    }

    entry.count++;

    const remaining = Math.max(0, config.maxRequests - entry.count);
    const resetTime = Math.ceil((entry.resetTime - now) / 1000);

    const response = await handler();

    // Add rate limit headers
    response.headers.set("X-RateLimit-Limit", config.maxRequests.toString());
    response.headers.set("X-RateLimit-Remaining", remaining.toString());
    response.headers.set("X-RateLimit-Reset", resetTime.toString());

    if (entry.count > config.maxRequests) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": config.maxRequests.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": resetTime.toString(),
            "Retry-After": resetTime.toString(),
          },
        },
      );
    }

    return response;
  };
}

/**
 * Pre-configured rate limiters for auth endpoints
 */
export const authRateLimiters = {
  // Strict limit for login attempts
  login: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    // maxRequests: 5, // 5 attempts per 15 minutes
    maxRequests: 999, // 999 attempts per 15 minutes
    keyPrefix: "auth:login",
  }),

  // Moderate limit for registration
  register: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    // maxRequests: 3, // 3 registrations per hour
    maxRequests: 999, // 999 registrations per hour
    keyPrefix: "auth:register",
  }),

  // Moderate limit for password reset
  forgotPassword: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    // maxRequests: 3, // 3 requests per hour
    maxRequests: 999, // 999 requests per hour
    keyPrefix: "auth:forgot-password",
  }),

  // Moderate limit for email verification resend
  resendVerification: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    // maxRequests: 3, // 3 resends per hour
    maxRequests: 999, // 999 resends per hour
    keyPrefix: "auth:resend-verification",
  }),

  // General auth endpoints
  general: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    // maxRequests: 20, // 20 requests per 15 minutes
    maxRequests: 999, // 999 requests per 15 minutes
    keyPrefix: "auth:general",
  }),
};

/**
 * Helper to apply rate limiting to a route handler
 */
export function withRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  limiter: ReturnType<typeof rateLimit>,
) {
  return async (request: NextRequest) => {
    return limiter(request, () => handler(request));
  };
}
