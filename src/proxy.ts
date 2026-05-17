import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth-edge";

// === Global Safety Limiter ===
// Protects the entire system from abuse (e.g. one IP hammering the API)
const isGlobalRateLimitingEnabled = !!process.env.UPSTASH_REDIS_REST_URL;

let globalLimiter: Ratelimit | null = null;

if (isGlobalRateLimitingEnabled) {
  try {
    globalLimiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(500, "1 m"), // 500 req/min across all IPs
      analytics: true,
      prefix: "ratelimit:global",
    });
  } catch (err) {
    console.error("[Proxy] Failed to initialize global rate limiter:", err);
    globalLimiter = null;
  }
}

// getUserIdFromRequest is imported from the Edge-safe @/lib/auth-edge module (correct JWE decryption, no Node.js dependencies)

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Skip auth and internal status routes
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/orbit/status")
  ) {
    return NextResponse.next();
  }

  // === Global Safety Limit ===
  // Improved IP extraction (still trusts first hop — document proxy chain in production)
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip =
    forwardedFor?.split(",")[0]?.trim() ||
    realIp?.trim() ||
    "unknown";

  // Safely check global rate limit. If Redis is down or misconfigured, fail open.
  if (globalLimiter) {
    try {
      const globalResult = await globalLimiter.limit(ip);

      if (!globalResult.success) {
        return NextResponse.json(
          {
            error: "Too Many Requests",
            message: "The system is under high load. Please try again later.",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil((globalResult.reset - Date.now()) / 1000)),
            },
          }
        );
      }
    } catch (error) {
      console.error("[Proxy] Global rate limit check failed (failing open):", error);
      // Fail open to avoid taking down the entire application
    }
  }

  // === Per-user rate limiting ===
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.next();
  }

  const method = request.method;
  const action = method === "GET" || method === "HEAD" ? "api:read" : "api:write";

  // Wrap per-user rate limiting in try/catch as an extra safety net
  try {
    const rateLimitResult = await checkRateLimit(action, userId);

    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult);
    }
  } catch (error) {
    console.error("[Proxy] Per-user rate limit check failed (failing open):", error);
    // Fail open — do not block legitimate users when rate limiting is broken
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
