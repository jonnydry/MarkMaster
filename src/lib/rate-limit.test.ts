import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The module caches `isRateLimitingEnabled` and the Ratelimit singletons at
 * module scope, so every test stubs env first, then does a fresh dynamic
 * import after vi.resetModules().
 */

const limitMock = vi.hoisted(() => vi.fn());
const resetUsedTokensMock = vi.hoisted(() => vi.fn());
const constructedConfigs = vi.hoisted(
  () => [] as Array<{ prefix: string; limiter: unknown }>
);
const fromEnvMock = vi.hoisted(() => vi.fn(() => ({ __fakeRedis: true })));

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: fromEnvMock },
}));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    private readonly prefix: string;

    constructor(config: { prefix: string; limiter: unknown }) {
      this.prefix = config.prefix;
      constructedConfigs.push(config);
    }

    limit(identifier: string) {
      return limitMock(this.prefix, identifier);
    }

    resetUsedTokens(identifier: string) {
      return resetUsedTokensMock(this.prefix, identifier);
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

function enableUpstash() {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token");
}

async function importRateLimit() {
  return await import("@/lib/rate-limit");
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  constructedConfigs.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("isRateLimitingEnabled", () => {
  it("is false when UPSTASH_REDIS_REST_URL is unset", async () => {
    const { isRateLimitingEnabled } = await importRateLimit();
    expect(isRateLimitingEnabled).toBe(false);
  });

  it("is true when UPSTASH_REDIS_REST_URL is set", async () => {
    enableUpstash();
    const { isRateLimitingEnabled } = await importRateLimit();
    expect(isRateLimitingEnabled).toBe(true);
  });
});

describe("checkRateLimit with Upstash unconfigured", () => {
  it("allows requests outside production (dev safety net)", async () => {
    const { checkRateLimit } = await importRateLimit();

    const result = await checkRateLimit("api:read", "user-1");

    expect(result.success).toBe(true);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it("fails CLOSED in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { checkRateLimit } = await importRateLimit();

    const result = await checkRateLimit("sync", "user-1");

    expect(result.success).toBe(false);
    expect(result.retryAfter).toBe(60);
    expect(limitMock).not.toHaveBeenCalled();
  });
});

describe("checkRateLimit with Upstash configured", () => {
  it("routes each action to its own prefixed bucket", async () => {
    enableUpstash();
    limitMock.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
    });
    const { checkRateLimit } = await importRateLimit();

    const expectedPrefixes: Record<string, string> = {
      sync: "ratelimit:sync",
      orbit: "ratelimit:orbit",
      "orbit:graph": "ratelimit:orbit-graph",
      media: "ratelimit:media",
      "api:read": "ratelimit:api-read",
      "api:write": "ratelimit:api-write",
      "csp-report": "ratelimit:csp-report",
    };

    for (const [action, prefix] of Object.entries(expectedPrefixes)) {
      limitMock.mockClear();
      await checkRateLimit(
        action as Parameters<typeof checkRateLimit>[0],
        "user-1"
      );
      expect(limitMock).toHaveBeenCalledExactlyOnceWith(prefix, "user-1");
    }
  });

  it("passes through a successful limiter result", async () => {
    enableUpstash();
    const reset = Date.now() + 60_000;
    limitMock.mockResolvedValue({ success: true, limit: 100, remaining: 42, reset });
    const { checkRateLimit } = await importRateLimit();

    const result = await checkRateLimit("api:read", "user-1");

    expect(result).toEqual({ success: true, limit: 100, remaining: 42, reset });
    expect(result.retryAfter).toBeUndefined();
  });

  it("computes retryAfter in seconds when the limiter denies", async () => {
    enableUpstash();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T00:00:00Z"));
    const reset = Date.now() + 30_000;
    limitMock.mockResolvedValue({ success: false, limit: 1, remaining: 0, reset });
    const { checkRateLimit } = await importRateLimit();

    const result = await checkRateLimit("sync", "user-1");

    expect(result.success).toBe(false);
    expect(result.retryAfter).toBe(30);
  });

  it("fails OPEN when the limiter throws at runtime", async () => {
    enableUpstash();
    limitMock.mockRejectedValue(new Error("redis unreachable"));
    const { checkRateLimit } = await importRateLimit();

    const result = await checkRateLimit("api:write", "user-1");

    expect(result.success).toBe(true);
  });
});

describe("checkGlobalRateLimit", () => {
  it("fails CLOSED in production when Upstash is unconfigured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { checkGlobalRateLimit } = await importRateLimit();

    const result = await checkGlobalRateLimit("sync");

    expect(result.success).toBe(false);
    expect(result.retryAfter).toBe(60);
  });

  it("allows requests outside production when Upstash is unconfigured", async () => {
    const { checkGlobalRateLimit } = await importRateLimit();

    await expect(checkGlobalRateLimit("orbit")).resolves.toMatchObject({
      success: true,
    });
  });

  it("uses the system-wide bucket keyed by 'global' per action", async () => {
    enableUpstash();
    limitMock.mockResolvedValue({
      success: true,
      limit: 50,
      remaining: 49,
      reset: Date.now() + 60_000,
    });
    const { checkGlobalRateLimit } = await importRateLimit();

    await checkGlobalRateLimit("sync");
    expect(limitMock).toHaveBeenLastCalledWith("ratelimit:global-sync", "global");

    await checkGlobalRateLimit("orbit");
    expect(limitMock).toHaveBeenLastCalledWith("ratelimit:global-orbit", "global");
  });

  it("fails OPEN when the global limiter throws", async () => {
    enableUpstash();
    limitMock.mockRejectedValue(new Error("boom"));
    const { checkGlobalRateLimit } = await importRateLimit();

    await expect(checkGlobalRateLimit("sync")).resolves.toMatchObject({
      success: true,
    });
  });
});

describe("createRateLimitResponse", () => {
  it("returns a 429 with Retry-After and X-RateLimit-* headers", async () => {
    const { createRateLimitResponse } = await importRateLimit();

    const response = createRateLimitResponse({
      success: false,
      limit: 30,
      remaining: 0,
      reset: 1_756_500_000_000,
      retryAfter: 42,
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("30");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("X-RateLimit-Reset")).toBe("1756500000000");

    const body = await response.json();
    expect(body.error).toBe("Too Many Requests");
    expect(body.message).toContain("42 seconds");
  });

  it("defaults Retry-After to 60 when retryAfter is missing", async () => {
    const { createRateLimitResponse } = await importRateLimit();

    const response = createRateLimitResponse({
      success: false,
      limit: 1,
      remaining: 0,
      reset: Date.now(),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });
});

describe("resetUserRateLimit", () => {
  it("is a no-op success when Upstash is unconfigured", async () => {
    const { resetUserRateLimit } = await importRateLimit();

    await expect(resetUserRateLimit("media", "user-1")).resolves.toMatchObject({
      ok: true,
    });
    expect(resetUsedTokensMock).not.toHaveBeenCalled();
  });

  it("resets the real bucket for the user+action", async () => {
    enableUpstash();
    resetUsedTokensMock.mockResolvedValue(undefined);
    const { resetUserRateLimit } = await importRateLimit();

    const result = await resetUserRateLimit("media", "user-1");

    expect(result).toEqual({ ok: true });
    expect(resetUsedTokensMock).toHaveBeenCalledExactlyOnceWith(
      "ratelimit:media",
      "user-1"
    );
  });

  it("reports failure without throwing when the reset call fails", async () => {
    enableUpstash();
    resetUsedTokensMock.mockRejectedValue(new Error("boom"));
    const { resetUserRateLimit } = await importRateLimit();

    await expect(resetUserRateLimit("sync", "user-1")).resolves.toMatchObject({
      ok: false,
    });
  });
});
