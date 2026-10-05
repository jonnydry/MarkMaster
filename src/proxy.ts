import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { checkRateLimit, createRateLimitResponse, isRateLimitingEnabled } from "@/lib/rate-limit";
import { isLightweightApiRequest } from "@/lib/lightweight-api-routes";
import {
  getUserIdFromRequest,
  undecryptableSessionCookieNames,
} from "@/lib/auth-edge";
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
      // No Upstash analytics: each check stays a single Redis roundtrip (Speed-H2).
      analytics: false,
      prefix: "ratelimit:global",
    });
    authLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "5 m"),
      // No Upstash analytics: each check stays a single Redis roundtrip (Speed-H2).
      analytics: false,
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

function requestHeadersWithoutCookies(
  request: NextRequest,
  names: readonly string[]
): Headers {
  const drop = new Set(names);
  const headers = new Headers(request.headers);
  const remaining = (headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false;
      const eq = part.indexOf("=");
      const name = (eq === -1 ? part : part.slice(0, eq)).trim();
      return !drop.has(name);
    })
    .join("; ");
  // Override the incoming Cookie header. Omitting it would keep the original.
  headers.set("cookie", remaining);
  return headers;
}

function expireSessionCookies(
  response: NextResponse,
  names: readonly string[]
): NextResponse {
  for (const name of names) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    });
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Auth.js owns Set-Cookie on its own routes (sign-in writes a new session
  // while the request may still carry the old one). Everywhere else, drop a
  // session cookie this process cannot decrypt before Server Components call
  // auth() — otherwise the failure is logged and the cookie is never cleared.
  const staleSessionCookies = pathname.startsWith("/api/auth")
    ? []
    : await undecryptableSessionCookieNames(request);

  const continueNext = () => {
    if (staleSessionCookies.length === 0) return NextResponse.next();
    const response = NextResponse.next({
      request: { headers: requestHeadersWithoutCookies(request, staleSessionCookies) },
    });
    return expireSessionCookies(response, staleSessionCookies);
  };

  const finish = (response: NextResponse) =>
    staleSessionCookies.length === 0
      ? response
      : expireSessionCookies(response, staleSessionCookies);

  const isApiRoute = pathname.startsWith("/api");
  const isPublicShareRoute = pathname.startsWith("/share/");

  if (!isApiRoute && !isPublicShareRoute) {
    return continueNext();
  }

  // Health checks bypass all rate limiting: uptime monitors poll frequently
  // and must see real service state even when Redis is down or unconfigured.
  if (pathname === "/api/health") {
    return continueNext();
  }

  const isAuthRoute = pathname.startsWith("/api/auth");

  // SameSite=Lax cookies are the primary CSRF defense; this backstop rejects
  // mutating API requests whose Origin header disagrees with our own origin.
  // Absence of the header must pass (server-to-server calls like the sync
  // worker dispatch set none). NextAuth routes run their own CSRF protection.
  if (isApiRoute && !isAuthRoute && MUTATING_METHODS.has(request.method)) {
    const originHeader = request.headers.get("origin");
    if (originHeader && !isTrustedOrigin(originHeader, request)) {
      return finish(NextResponse.json(
        { error: "Forbidden", message: "Cross-origin request rejected." },
        { status: 403 }
      ));
    }
  }

  const skipsPerUserLimit =
    isPublicShareRoute ||
    isAuthRoute ||
    pathname.startsWith("/api/orbit/status") ||
    pathname.startsWith("/api/internal/sync") ||
    pathname.startsWith("/api/internal/orbit");

  if (
    process.env.NODE_ENV === "production" &&
    !isRateLimitingEnabled &&
    !skipsPerUserLimit
  ) {
    logError("Proxy", "UPSTASH_REDIS_REST_URL is required in production");
    return finish(NextResponse.json(
      {
        error: "Service Unavailable",
        message: "Rate limiting is not configured.",
      },
      { status: 503 }
    ));
  }

  // === Rate limiting ===
  // Resolve the client IP without trusting client-spoofable x-forwarded-for hops.
  // Tune TRUSTED_PROXY_HOPS to your deployment's proxy chain (see lib/client-ip.ts).
  const ip = getClientIp(request.headers);
  const limiters = getProxyLimiters();

  // Each check resolves to a denial response or null. They run concurrently
  // (Speed-H2): the old serial chain cost 2-3 Upstash roundtrips per request.
  // Denial precedence is unchanged — auth before global, global before
  // per-user — and every check fails open on Redis errors.

  // OAuth endpoints stay reachable when the main API is intentionally failing
  // closed, but receive their own conservative IP budget when Redis is present.
  const checkAuthIpLimit = async (): Promise<NextResponse | null> => {
    if (!isAuthRoute || !limiters.authLimiter) return null;
    try {
      const authResult = await limiters.authLimiter.limit(ip);
      if (!authResult.success) {
        return finish(NextResponse.json(
          { error: "Too Many Requests", message: "Too many sign-in attempts." },
          {
            status: 429,
            headers: {
              "Retry-After": String(
                Math.max(1, Math.ceil((authResult.reset - Date.now()) / 1000))
              ),
            },
          }
        ));
      }
    } catch (error) {
      logError("Proxy", "Auth rate limit check failed (failing open)", error);
    }
    return null;
  };

  const checkGlobalIpLimit = async (): Promise<NextResponse | null> => {
    if (!limiters.globalLimiter) return null;
    try {
      const globalResult = await limiters.globalLimiter.limit(ip);
      if (!globalResult.success) {
        return finish(NextResponse.json(
          {
            error: "Too Many Requests",
            message: "The system is under high load. Please try again later.",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(
                Math.ceil((globalResult.reset - Date.now()) / 1000)
              ),
            },
          }
        ));
      }
    } catch (error) {
      logError("Proxy", "Global rate limit check failed (failing open)", error);
      // Fail open to avoid taking down the entire application
    }
    return null;
  };

  // api:read / api:write are enforced here for all authenticated API routes.
  // Route handlers use checkRateLimit only for specialized buckets (sync, orbit, csp-report).
  const checkPerUserLimit = async (): Promise<NextResponse | null> => {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return null;

    const method = request.method;
    if (isLightweightApiRequest(pathname, method)) return null;

    const action =
      method === "GET" || method === "HEAD" ? "api:read" : "api:write";

    // Wrap per-user rate limiting in try/catch as an extra safety net
    try {
      const rateLimitResult = await checkRateLimit(action, userId);
      if (!rateLimitResult.success) {
        return finish(createRateLimitResponse(rateLimitResult));
      }
    } catch (error) {
      logError("Proxy", "Per-user rate limit check failed (failing open)", error);
      // Fail open — do not block legitimate users when rate limiting is broken
    }
    return null;
  };

  if (skipsPerUserLimit) {
    const [authDenied, globalDenied] = await Promise.all([
      checkAuthIpLimit(),
      checkGlobalIpLimit(),
    ]);
    if (authDenied) return authDenied;
    if (globalDenied) return globalDenied;
    return continueNext();
  }

  const [globalDenied, perUserDenied] = await Promise.all([
    checkGlobalIpLimit(),
    checkPerUserLimit(),
  ]);
  if (globalDenied) return globalDenied;
  if (perUserDenied) return perUserDenied;

  return continueNext();
}

export const config = {
  matcher: [
    "/api/:path*",
    "/share/:path*",
    // Pages call auth() in Server Components. Auth.js logs JWTSessionError for
    // an undecryptable session and tries to expire the cookie, but that
    // Set-Cookie is dropped on the RSC path. Match documents so the proxy can
    // remove it first. Static files stay off this path.
    "/((?!api/|_next/|share/|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
