import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { checkRateLimit, createRateLimitResponse, isRateLimitingEnabled } from "@/lib/rate-limit";
import { isLightweightApiRequest } from "@/lib/lightweight-api-routes";
import { getUserIdFromRequest } from "@/lib/auth-edge";
import { getClientIp } from "@/lib/client-ip";
import { logError } from "@/lib/logger";

// === Global Safety Limiter ===
// Protects the entire system from abuse (e.g. one IP hammering the API)
const isGlobalRateLimitingEnabled = isRateLimitingEnabled;

let proxyRedis: ReturnType<typeof Redis.fromEnv> | null = null;
let globalLimiter: Ratelimit | null = null;
let authLimiter: Ratelimit | null = null;

function getProxyRedis() {
  if (!proxyRedis && isGlobalRateLimitingEnabled) {
    proxyRedis = Redis.fromEnv();
  }
  return proxyRedis;
}

function getProxyLimiters() {
  if ((globalLimiter && authLimiter) || !isGlobalRateLimitingEnabled) {
    return { globalLimiter, authLimiter };
  }

  try {
    const redis = getProxyRedis();
    if (!redis) return { globalLimiter: null, authLimiter: null };
    globalLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(500, "1 m"), // 500 req/min across all IPs
      analytics: true,
      prefix: "ratelimit:global",
    });
    authLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "5 m"),
      analytics: true,
      prefix: "ratelimit:auth",
    });
  } catch (err) {
    logError("Proxy", "Failed to initialize global rate limiter", err);
    globalLimiter = null;
    authLimiter = null;
  }

  return { globalLimiter, authLimiter };
}

// getUserIdFromRequest is imported from the Edge-safe @/lib/auth-edge module (correct JWE decryption, no Node.js dependencies)

// === CSRF origin verification ===
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isTrustedOrigin(originHeader: string, request: NextRequest): boolean {
  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    // Includes the literal "null" Origin sent from sandboxed/opaque contexts.
    return false;
  }

  if (origin.origin === request.nextUrl.origin) return true;
  if (origin.host === request.headers.get("host")) return true;

  for (const configured of [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
  ]) {
    const trimmed = configured?.trim();
    if (!trimmed) continue;
    try {
      if (new URL(trimmed).origin === origin.origin) return true;
    } catch {
      // Ignore malformed configured URLs.
    }
  }

  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api");
  const isPublicShareRoute = pathname.startsWith("/share/");

  if (!isApiRoute && !isPublicShareRoute) {
    return NextResponse.next();
  }

  // Health checks bypass all rate limiting: uptime monitors poll frequently
  // and must see real service state even when Redis is down or unconfigured.
  if (pathname === "/api/health") {
    return NextResponse.next();
  }

  const isAuthRoute = pathname.startsWith("/api/auth");

  // SameSite=Lax cookies are the primary CSRF defense; this backstop rejects
  // mutating API requests whose Origin header disagrees with our own origin.
  // Absence of the header must pass (server-to-server calls like the sync
  // worker dispatch set none). NextAuth routes run their own CSRF protection.
  if (isApiRoute && !isAuthRoute && MUTATING_METHODS.has(request.method)) {
    const originHeader = request.headers.get("origin");
    if (originHeader && !isTrustedOrigin(originHeader, request)) {
      return NextResponse.json(
        { error: "Forbidden", message: "Cross-origin request rejected." },
        { status: 403 }
      );
    }
  }

  const skipsPerUserLimit =
    isPublicShareRoute ||
    isAuthRoute ||
    pathname.startsWith("/api/orbit/status") ||
    pathname.startsWith("/api/internal/sync");

  if (
    process.env.NODE_ENV === "production" &&
    !isRateLimitingEnabled &&
    !skipsPerUserLimit
  ) {
    logError("Proxy", "UPSTASH_REDIS_REST_URL is required in production");
    return NextResponse.json(
      {
        error: "Service Unavailable",
        message: "Rate limiting is not configured.",
      },
      { status: 503 }
    );
  }

  // === Global Safety Limit ===
  // Resolve the client IP without trusting client-spoofable x-forwarded-for hops.
  // Tune TRUSTED_PROXY_HOPS to your deployment's proxy chain (see lib/client-ip.ts).
  const ip = getClientIp(request.headers);
  const limiters = getProxyLimiters();

  // OAuth endpoints stay reachable when the main API is intentionally failing
  // closed, but receive their own conservative IP budget when Redis is present.
  if (isAuthRoute && limiters.authLimiter) {
    try {
      const authResult = await limiters.authLimiter.limit(ip);
      if (!authResult.success) {
        return NextResponse.json(
          { error: "Too Many Requests", message: "Too many sign-in attempts." },
          {
            status: 429,
            headers: {
              "Retry-After": String(
                Math.max(1, Math.ceil((authResult.reset - Date.now()) / 1000))
              ),
            },
          }
        );
      }
    } catch (error) {
      logError("Proxy", "Auth rate limit check failed (failing open)", error);
    }
  }

  // Safely check global rate limit. If Redis is down or misconfigured, fail open.
  if (limiters.globalLimiter) {
    try {
      const globalResult = await limiters.globalLimiter.limit(ip);

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
      logError("Proxy", "Global rate limit check failed (failing open)", error);
      // Fail open to avoid taking down the entire application
    }
  }

  if (skipsPerUserLimit) {
    return NextResponse.next();
  }

  // === Per-user rate limiting ===
  // api:read / api:write are enforced here for all authenticated API routes.
  // Route handlers use checkRateLimit only for specialized buckets (sync, orbit, csp-report).
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.next();
  }

  const method = request.method;

  if (isLightweightApiRequest(pathname, method)) {
    return NextResponse.next();
  }

  const action = method === "GET" || method === "HEAD" ? "api:read" : "api:write";

  // Wrap per-user rate limiting in try/catch as an extra safety net
  try {
    const rateLimitResult = await checkRateLimit(action, userId);

    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult);
    }
  } catch (error) {
    logError("Proxy", "Per-user rate limit check failed (failing open)", error);
    // Fail open — do not block legitimate users when rate limiting is broken
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/share/:path*"],
};
