import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { NextResponse } from "next/server";
import { logError } from "@/lib/logger";

/**
 * Rate Limiting Configuration
 *
 * Conservative limits designed for a tool that may eventually be open-sourced
 * or offered to others. Sync is the most expensive operation (X API cost),
 * so it is heavily restricted. Orbit scans are more generous.
 */

export type RateLimitAction =
  | "sync"
  | "orbit"
  | "orbit:graph"
  | "media"
  | "api:read"
  | "api:write"
  | "csp-report";

/**
 * Actions exposed by the debug reset endpoint.
 * Excludes "csp-report" (public/IP-keyed) and the global limiters.
 */
export const DEBUG_RATE_LIMIT_ACTIONS = [
  "sync",
  "orbit",
  "orbit:graph",
  "media",
  "api:read",
  "api:write",
] as const satisfies readonly RateLimitAction[];

export type DebugRateLimitAction = (typeof DEBUG_RATE_LIMIT_ACTIONS)[number];

interface RateLimitPolicy {
  requests: number;
  window: `${number} ${"s" | "m" | "h" | "d"}`;
  description: string;
}

/**
 * Centralized rate limit policies.
 * Easy to adjust as the project evolves.
 */
const POLICIES: Record<RateLimitAction, RateLimitPolicy> = {
  sync: {
    requests: 1,
    window: "30 m",
    description: "Bookmark sync - very expensive (X API + processing)",
  },
  orbit: {
    requests: 10,
    window: "1 d",
    description: "Orbit scans - more generous than syncs",
  },
  "orbit:graph": {
    requests: 120,
    window: "1 h",
    description: "Orbit map graph reads - expensive graph generation",
  },
  media: {
    requests: 600,
    window: "5 m",
    description: "Authenticated media proxy range requests",
  },
  "api:read": {
    requests: 100,
    window: "5 m",
    description: "General read operations (bookmarks, tags, collections, etc.)",
  },
  "api:write": {
    requests: 30,
    window: "5 m",
    description: "General write operations (creating/updating tags, collections, etc.)",
  },
  "csp-report": {
    requests: 200,
    window: "5 m",
    description: "CSP violation reports (public ingestion endpoint - abuse protection)",
  },
};

// Development safety net: disable rate limiting when Upstash is not configured
export const isRateLimitingEnabled = !!process.env.UPSTASH_REDIS_REST_URL;

// Lazy Redis + Ratelimit initialization
// Only created when Upstash credentials are actually present.
// This prevents noisy "[Upstash Redis] Unable to find environment variable" warnings.
let _redis: ReturnType<typeof Redis.fromEnv> | null = null;
let _ratelimiters: Record<RateLimitAction, Ratelimit> | null = null;

function getRedis() {
  if (!_redis && isRateLimitingEnabled) {
    _redis = Redis.fromEnv();
  }
  return _redis;
}

function getRatelimiters(): Record<RateLimitAction, Ratelimit> | null {
  if (!_ratelimiters && getRedis()) {
    const r = getRedis()!;
    _ratelimiters = {
      sync: new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(
          POLICIES.sync.requests,
          POLICIES.sync.window
        ),
        analytics: true,
        prefix: "ratelimit:sync",
      }),
      orbit: new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(
          POLICIES.orbit.requests,
          POLICIES.orbit.window
        ),
        analytics: true,
        prefix: "ratelimit:orbit",
      }),
      "orbit:graph": new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(
          POLICIES["orbit:graph"].requests,
          POLICIES["orbit:graph"].window
        ),
        analytics: true,
        prefix: "ratelimit:orbit-graph",
      }),
      media: new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(
          POLICIES.media.requests,
          POLICIES.media.window
        ),
        analytics: true,
        prefix: "ratelimit:media",
      }),
      "api:read": new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(
          POLICIES["api:read"].requests,
          POLICIES["api:read"].window
        ),
        analytics: true,
        prefix: "ratelimit:api-read",
      }),
      "api:write": new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(
          POLICIES["api:write"].requests,
          POLICIES["api:write"].window
        ),
        analytics: true,
        prefix: "ratelimit:api-write",
      }),
      "csp-report": new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(
          POLICIES["csp-report"].requests,
          POLICIES["csp-report"].window
        ),
        analytics: true,
        prefix: "ratelimit:csp-report",
      }),
    };
  }
  return _ratelimiters;
}

// === Global Safety Limits ===
// These protect the entire system (important once the app has multiple users)
const GLOBAL_SYNC_LIMIT = { requests: 50, window: "1 h" as const };
const GLOBAL_ORBIT_LIMIT = { requests: 200, window: "1 d" as const };

let _globalSyncLimiter: Ratelimit | null = null;
let _globalOrbitLimiter: Ratelimit | null = null;

function getGlobalSyncLimiter() {
  if (!_globalSyncLimiter && getRedis()) {
    _globalSyncLimiter = new Ratelimit({
      redis: getRedis()!,
      limiter: Ratelimit.slidingWindow(GLOBAL_SYNC_LIMIT.requests, GLOBAL_SYNC_LIMIT.window),
      analytics: true,
      prefix: "ratelimit:global-sync",
    });
  }
  return _globalSyncLimiter;
}

function getGlobalOrbitLimiter() {
  if (!_globalOrbitLimiter && getRedis()) {
    _globalOrbitLimiter = new Ratelimit({
      redis: getRedis()!,
      limiter: Ratelimit.slidingWindow(GLOBAL_ORBIT_LIMIT.requests, GLOBAL_ORBIT_LIMIT.window),
      analytics: true,
      prefix: "ratelimit:global-orbit",
    });
  }
  return _globalOrbitLimiter;
}

/**
 * Development safety net: If Redis is not configured, disable rate limiting
 * so local development isn't blocked.
 */


export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp (ms) when the limit resets
  retryAfter?: number; // Seconds until user can retry
}

/**
 * Checks if a user has exceeded their rate limit for a specific action.
 *
 * @param action - The type of action being rate limited
 * @param userId - The user's ID (from the database)
 * @returns RateLimitResult with success status and metadata
 */
export async function checkRateLimit(
  action: RateLimitAction,
  userId: string
): Promise<RateLimitResult> {
  // In development without Upstash configured, always allow requests
  if (!isRateLimitingEnabled) {
    if (process.env.NODE_ENV === "production") {
      return {
        success: false,
        limit: 0,
        remaining: 0,
        reset: Date.now(),
        retryAfter: 60,
      };
    }

    return {
      success: true,
      limit: 999,
      remaining: 999,
      reset: Date.now() + 60_000,
    };
  }

  const ratelimitersMap = getRatelimiters();
  const ratelimiter = ratelimitersMap ? ratelimitersMap[action] : null;

  if (!ratelimiter) {
    return {
      success: true,
      limit: 999,
      remaining: 999,
      reset: Date.now() + 60_000,
    };
  }

  try {
    const { success, limit, remaining, reset } = await ratelimiter.limit(userId);

    const result: RateLimitResult = {
      success,
      limit,
      remaining,
      reset,
    };

    if (!success) {
      const now = Date.now();
      result.retryAfter = Math.max(0, Math.ceil((reset - now) / 1000));
    }

    return result;
  } catch (error) {
    logError("RateLimit", `checkRateLimit failed for action "${action}" (failing open)`, error);
    // Fail open — never let rate limiting break the application
    return {
      success: true,
      limit: 999,
      remaining: 999,
      reset: Date.now() + 60_000,
    };
  }
}

/**
 * Helper to get a human-readable description of a rate limit policy.
 * Useful for error messages or admin UIs.
 */
export function getRateLimitDescription(action: RateLimitAction): string {
  return POLICIES[action].description;
}

/**
 * Clears the sliding-window state for a user+action (debug tooling only).
 * Uses Upstash's supported `resetUsedTokens` so the real bucket is cleared,
 * unlike a throwaway probe key. No-op when Upstash is not configured.
 */
export async function resetUserRateLimit(
  action: DebugRateLimitAction,
  userId: string
): Promise<{ ok: boolean; message?: string }> {
  if (!isRateLimitingEnabled) {
    return { ok: true, message: "Rate limiting disabled; nothing to reset." };
  }

  const ratelimiter = getRatelimiters()?.[action];
  if (!ratelimiter) {
    return { ok: false, message: "Rate limiter unavailable." };
  }

  try {
    await ratelimiter.resetUsedTokens(userId);
    return { ok: true };
  } catch (error) {
    logError("RateLimit", `resetUserRateLimit failed for "${action}"`, error);
    return { ok: false, message: "Failed to reset rate limit." };
  }
}

/**
 * Checks global (system-wide) rate limits for expensive operations.
 * This is a safety net when the app has multiple users.
 */
export async function checkGlobalRateLimit(
  action: "sync" | "orbit"
): Promise<RateLimitResult> {
  // If rate limiting is disabled (no Upstash creds), allow in dev only
  if (!isRateLimitingEnabled) {
    if (process.env.NODE_ENV === "production") {
      return {
        success: false,
        limit: 0,
        remaining: 0,
        reset: Date.now(),
        retryAfter: 60,
      };
    }

    return {
      success: true,
      limit: 999,
      remaining: 999,
      reset: Date.now() + 60_000,
    };
  }

  const limiter = action === "sync" ? getGlobalSyncLimiter() : getGlobalOrbitLimiter();

  if (!limiter) {
    // Redis not available — fail open
    return {
      success: true,
      limit: 999,
      remaining: 999,
      reset: Date.now() + 60_000,
    };
  }

  try {
    const { success, limit, remaining, reset } = await limiter.limit("global");

    const result: RateLimitResult = {
      success,
      limit,
      remaining,
      reset,
    };

    if (!success) {
      const now = Date.now();
      result.retryAfter = Math.max(0, Math.ceil((reset - now) / 1000));
    }

    return result;
  } catch (error) {
    logError("RateLimit", `checkGlobalRateLimit failed for "${action}" (failing open)`, error);
    return {
      success: true,
      limit: 999,
      remaining: 999,
      reset: Date.now() + 60_000,
    };
  }
}

/**
 * Creates a standardized 429 "Too Many Requests" response.
 * Includes Retry-After header and a helpful error message.
 */
export function createRateLimitResponse(result: RateLimitResult): NextResponse {
  const message = result.retryAfter
    ? `Rate limit exceeded. Please try again in ${result.retryAfter} seconds.`
    : "Rate limit exceeded. Please try again later.";

  return NextResponse.json(
    {
      error: "Too Many Requests",
      message,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfter ?? 60),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.reset),
      },
    }
  );
}
