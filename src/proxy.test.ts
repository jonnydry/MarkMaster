import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The proxy captures `isRateLimitingEnabled` and its Ratelimit singletons at
 * module scope, so tests mutate hoisted state, vi.resetModules(), and
 * dynamically import a fresh copy per test.
 */

const getUserIdFromRequestMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const createRateLimitResponseMock = vi.hoisted(() => vi.fn());
const rateLimitState = vi.hoisted(() => ({ enabled: false }));
// Called as (prefix, identifier) for both the global and auth proxy limiters.
const proxyLimitMock = vi.hoisted(() => vi.fn());
const fromEnvMock = vi.hoisted(() => vi.fn(() => ({ __fakeRedis: true })));

vi.mock("@/lib/auth-edge", () => ({
  getUserIdFromRequest: getUserIdFromRequestMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  get isRateLimitingEnabled() {
    return rateLimitState.enabled;
  },
  checkRateLimit: checkRateLimitMock,
  createRateLimitResponse: createRateLimitResponseMock,
}));

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: fromEnvMock },
}));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    private readonly prefix: string;

    constructor(config: { prefix: string }) {
      this.prefix = config.prefix;
    }

    limit(identifier: string) {
      return proxyLimitMock(this.prefix, identifier);
    }

    static slidingWindow(requests: number, window: string) {
      return { requests, window };
    }
  }
  return { Ratelimit };
});

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

async function importProxy() {
  const mod = await import("@/proxy");
  return mod.proxy;
}

function makeRequest(path: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"), init);
}

function expectPassthrough(response: Response) {
  // NextResponse.next() marks the response so Next.js continues the chain.
  expect(response.headers.get("x-middleware-next")).toBe("1");
}

const allowResult = {
  success: true,
  limit: 500,
  remaining: 499,
  reset: Date.now() + 60_000,
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  rateLimitState.enabled = true;
  getUserIdFromRequestMock.mockResolvedValue(null);
  proxyLimitMock.mockResolvedValue(allowResult);
  checkRateLimitMock.mockResolvedValue(allowResult);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("proxy routing scope", () => {
  it("passes non-API, non-share paths through untouched", async () => {
    const proxy = await importProxy();

    const response = await proxy(makeRequest("/dashboard"));

    expectPassthrough(response);
    expect(proxyLimitMock).not.toHaveBeenCalled();
    expect(getUserIdFromRequestMock).not.toHaveBeenCalled();
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it("lets /api/health bypass every limiter, even when limits would deny", async () => {
    proxyLimitMock.mockResolvedValue({ success: false, reset: Date.now() + 60_000 });
    const proxy = await importProxy();

    const response = await proxy(makeRequest("/api/health"));

    expectPassthrough(response);
    expect(proxyLimitMock).not.toHaveBeenCalled();
    expect(getUserIdFromRequestMock).not.toHaveBeenCalled();
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it("rate-limits public share routes globally but never per-user", async () => {
    const proxy = await importProxy();

    const response = await proxy(makeRequest("/share/abc123"));

    expectPassthrough(response);
    expect(proxyLimitMock).toHaveBeenCalledWith("ratelimit:global", expect.any(String));
    expect(getUserIdFromRequestMock).not.toHaveBeenCalled();
  });
});

describe("production without Upstash configured", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    rateLimitState.enabled = false;
  });

  it("returns 503 for normal API routes (fail closed)", async () => {
    const proxy = await importProxy();

    const response = await proxy(makeRequest("/api/bookmarks"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "Service Unavailable",
    });
  });

  it.each([
    "/api/auth/signin",
    "/api/orbit/status",
    "/api/internal/sync",
    "/api/health",
    "/share/abc123",
  ])("keeps exempt route %s reachable", async (path) => {
    const proxy = await importProxy();

    const response = await proxy(makeRequest(path));

    expect(response.status).not.toBe(503);
    expectPassthrough(response);
  });
});

describe("auth limiter", () => {
  it("returns 429 with Retry-After when the auth budget is exhausted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T00:00:00Z"));
    proxyLimitMock.mockImplementation(async (prefix: string) =>
      prefix === "ratelimit:auth"
        ? { success: false, reset: Date.now() + 10_000 }
        : allowResult
    );
    const proxy = await importProxy();

    const response = await proxy(makeRequest("/api/auth/callback/twitter"));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("10");
    await expect(response.json()).resolves.toMatchObject({
      error: "Too Many Requests",
      message: "Too many sign-in attempts.",
    });
  });

  it("skips per-user limiting for auth routes when the auth limiter allows", async () => {
    const proxy = await importProxy();

    const response = await proxy(makeRequest("/api/auth/session"));

    expectPassthrough(response);
    expect(proxyLimitMock).toHaveBeenCalledWith("ratelimit:auth", expect.any(String));
    expect(getUserIdFromRequestMock).not.toHaveBeenCalled();
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it("fails open when the auth limiter throws", async () => {
    proxyLimitMock.mockImplementation(async (prefix: string) => {
      if (prefix === "ratelimit:auth") throw new Error("redis down");
      return allowResult;
    });
    const proxy = await importProxy();

    const response = await proxy(makeRequest("/api/auth/session"));

    expectPassthrough(response);
  });
});

describe("global limiter", () => {
  it("keys the global bucket by the trusted-proxy-resolved client IP", async () => {
    const proxy = await importProxy();

    await proxy(
      makeRequest("/api/bookmarks", {
        headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.7" },
      })
    );

    expect(proxyLimitMock).toHaveBeenCalledWith("ratelimit:global", "203.0.113.7");
  });

  it("returns 429 when the global budget is exhausted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T00:00:00Z"));
    proxyLimitMock.mockImplementation(async (prefix: string) =>
      prefix === "ratelimit:global"
        ? { success: false, reset: Date.now() + 5_000 }
        : allowResult
    );
    const proxy = await importProxy();

    const response = await proxy(makeRequest("/api/bookmarks"));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(getUserIdFromRequestMock).not.toHaveBeenCalled();
  });

  it("fails open and continues to per-user limiting when the global limiter throws", async () => {
    proxyLimitMock.mockRejectedValue(new Error("redis down"));
    getUserIdFromRequestMock.mockResolvedValue("user-1");
    const proxy = await importProxy();

    const response = await proxy(makeRequest("/api/bookmarks"));

    expectPassthrough(response);
    expect(checkRateLimitMock).toHaveBeenCalledWith("api:read", "user-1");
  });
});

describe("per-user limiter", () => {
  it("skips per-user limiting for unauthenticated requests", async () => {
    getUserIdFromRequestMock.mockResolvedValue(null);
    const proxy = await importProxy();

    const response = await proxy(makeRequest("/api/bookmarks"));

    expectPassthrough(response);
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it("skips per-user limiting for lightweight API requests", async () => {
    getUserIdFromRequestMock.mockResolvedValue("user-1");
    const proxy = await importProxy();

    const response = await proxy(makeRequest("/api/bookmarks/sync"));

    expectPassthrough(response);
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it("debits api:read for GET requests", async () => {
    getUserIdFromRequestMock.mockResolvedValue("user-1");
    const proxy = await importProxy();

    const response = await proxy(makeRequest("/api/tags"));

    expectPassthrough(response);
    expect(checkRateLimitMock).toHaveBeenCalledWith("api:read", "user-1");
  });

  it("debits api:write for mutating requests and returns the 429 response on denial", async () => {
    getUserIdFromRequestMock.mockResolvedValue("user-1");
    const denied = {
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 60_000,
      retryAfter: 60,
    };
    checkRateLimitMock.mockResolvedValue(denied);
    const sentinel = NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
    createRateLimitResponseMock.mockReturnValue(sentinel);
    const proxy = await importProxy();

    const response = await proxy(makeRequest("/api/tags", { method: "POST" }));

    expect(checkRateLimitMock).toHaveBeenCalledWith("api:write", "user-1");
    expect(createRateLimitResponseMock).toHaveBeenCalledWith(denied);
    expect(response).toBe(sentinel);
  });

  it("fails open when the per-user check throws", async () => {
    getUserIdFromRequestMock.mockResolvedValue("user-1");
    checkRateLimitMock.mockRejectedValue(new Error("redis down"));
    const proxy = await importProxy();

    const response = await proxy(makeRequest("/api/tags", { method: "POST" }));

    expectPassthrough(response);
  });

  it("never constructs proxy limiters when rate limiting is disabled", async () => {
    rateLimitState.enabled = false;
    getUserIdFromRequestMock.mockResolvedValue("user-1");
    const proxy = await importProxy();

    const response = await proxy(makeRequest("/api/tags"));

    expectPassthrough(response);
    expect(fromEnvMock).not.toHaveBeenCalled();
    expect(proxyLimitMock).not.toHaveBeenCalled();
    // Per-user checkRateLimit is still consulted (it has its own dev fallback).
    expect(checkRateLimitMock).toHaveBeenCalledWith("api:read", "user-1");
  });
});

describe("CSRF origin verification", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "rejects a cross-origin %s to an API route with 403",
    async (method) => {
      const proxy = await importProxy();

      const response = await proxy(
        makeRequest("/api/tags", {
          method,
          headers: { origin: "https://evil.example.com" },
        })
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: "Forbidden",
      });
      expect(getUserIdFromRequestMock).not.toHaveBeenCalled();
    }
  );

  it("rejects an opaque 'null' Origin on mutating API requests", async () => {
    const proxy = await importProxy();

    const response = await proxy(
      makeRequest("/api/tags", { method: "POST", headers: { origin: "null" } })
    );

    expect(response.status).toBe(403);
  });

  it("allows a mutating request whose Origin matches the request origin", async () => {
    getUserIdFromRequestMock.mockResolvedValue("user-1");
    const proxy = await importProxy();

    const response = await proxy(
      makeRequest("/api/tags", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
      })
    );

    expectPassthrough(response);
    expect(checkRateLimitMock).toHaveBeenCalledWith("api:write", "user-1");
  });

  it("allows an Origin matching the configured app URL env", async () => {
    vi.stubEnv("APP_URL", "https://markmaster.example.com");
    getUserIdFromRequestMock.mockResolvedValue("user-1");
    const proxy = await importProxy();

    const response = await proxy(
      makeRequest("/api/tags", {
        method: "POST",
        headers: { origin: "https://markmaster.example.com" },
      })
    );

    expectPassthrough(response);
  });

  it("allows mutating requests without an Origin header (sync worker dispatch)", async () => {
    const proxy = await importProxy();

    const response = await proxy(
      makeRequest("/api/internal/sync/worker", {
        method: "POST",
        headers: { authorization: "Bearer worker-secret" },
      })
    );

    expectPassthrough(response);
  });

  it("does not apply the origin check to GET requests", async () => {
    getUserIdFromRequestMock.mockResolvedValue("user-1");
    const proxy = await importProxy();

    const response = await proxy(
      makeRequest("/api/tags", {
        headers: { origin: "https://evil.example.com" },
      })
    );

    expectPassthrough(response);
  });

  it("does not apply the origin check to NextAuth routes", async () => {
    const proxy = await importProxy();

    const response = await proxy(
      makeRequest("/api/auth/signin", {
        method: "POST",
        headers: { origin: "https://evil.example.com" },
      })
    );

    expectPassthrough(response);
  });
});
