import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The module caches the Redis client and the in-flight compute map at module
 * scope, so every test stubs env first, then does a fresh dynamic import
 * after vi.resetModules().
 */

const redisMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  incr: vi.fn(),
}));
const fromEnvMock = vi.hoisted(() => vi.fn(() => redisMock));

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: fromEnvMock },
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

function enableUpstash() {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token");
}

async function importCache() {
  return await import("@/lib/upstash-cache");
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getCachedJson with Redis disabled (env unset)", () => {
  it("goes straight to compute without touching Redis", async () => {
    const { getCachedJson } = await importCache();
    const compute = vi.fn(async () => ({ answer: 42 }));

    const value = await getCachedJson("key-1", 60, compute);

    expect(value).toEqual({ answer: 42 });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(fromEnvMock).not.toHaveBeenCalled();
    expect(redisMock.get).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });
});

describe("getCachedJson with Redis enabled", () => {
  beforeEach(() => {
    enableUpstash();
  });

  it("returns the cached value without calling compute on a hit", async () => {
    // The real Upstash client auto-deserializes on GET, so a hit hands back
    // the parsed object — the module must return it as-is. (Regression guard:
    // a manual JSON.parse of this object used to throw and silently turn
    // every hit into a miss via the fail-open handler.)
    redisMock.get.mockResolvedValue({ cached: true });
    const { getCachedJson } = await importCache();
    const compute = vi.fn(async () => ({ cached: false }));

    const value = await getCachedJson("key-1", 60, compute);

    expect(value).toEqual({ cached: true });
    expect(compute).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it("computes and stores with the TTL on a miss", async () => {
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue("OK");
    const { getCachedJson } = await importCache();
    const compute = vi.fn(async () => ({ fresh: 1 }));

    const value = await getCachedJson("key-1", 120, compute);

    expect(value).toEqual({ fresh: 1 });
    expect(compute).toHaveBeenCalledTimes(1);
    // The raw value is handed to the client, whose default serializer
    // JSON.stringifies it — no manual stringify layer on top.
    expect(redisMock.set).toHaveBeenCalledWith(
      "key-1",
      { fresh: 1 },
      { ex: 120 }
    );
  });

  it("deduplicates concurrent computes for the same key (single-flight)", async () => {
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue("OK");
    const { getCachedJson } = await importCache();

    let resolveCompute!: (value: { n: number }) => void;
    const compute = vi.fn(
      () => new Promise<{ n: number }>((resolve) => (resolveCompute = resolve))
    );

    const first = getCachedJson("shared-key", 60, compute);
    const second = getCachedJson("shared-key", 60, compute);

    // Let both callers get past the redis.get miss and reach the in-flight map.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(compute).toHaveBeenCalledTimes(1);

    resolveCompute({ n: 7 });
    await expect(first).resolves.toEqual({ n: 7 });
    await expect(second).resolves.toEqual({ n: 7 });
  });

  it("does not share in-flight computes across different keys", async () => {
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue("OK");
    const { getCachedJson } = await importCache();
    const compute = vi.fn(async () => "value");

    await Promise.all([
      getCachedJson("key-a", 60, compute),
      getCachedJson("key-b", 60, compute),
    ]);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("clears the in-flight entry after completion so later misses recompute", async () => {
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue("OK");
    const { getCachedJson } = await importCache();
    const compute = vi.fn(async () => "value");

    await getCachedJson("key-1", 60, compute);
    await getCachedJson("key-1", 60, compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("fails open to compute when the Redis read throws", async () => {
    redisMock.get.mockRejectedValue(new Error("read failed"));
    redisMock.set.mockResolvedValue("OK");
    const { getCachedJson } = await importCache();
    const compute = vi.fn(async () => "computed");

    const value = await getCachedJson("key-1", 60, compute);

    expect(value).toBe("computed");
    expect(compute).toHaveBeenCalledTimes(1);
    // The write is still attempted so the next request can hit.
    expect(redisMock.set).toHaveBeenCalled();
  });

  it("still returns the computed value when the Redis write throws", async () => {
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockRejectedValue(new Error("write failed"));
    const { getCachedJson } = await importCache();
    const compute = vi.fn(async () => "computed");

    await expect(getCachedJson("key-1", 60, compute)).resolves.toBe("computed");
  });
});

describe("invalidateUserResponseCacheImmediate", () => {
  it("awaits the version bump for the right key", async () => {
    enableUpstash();
    let incrSettled = false;
    redisMock.incr.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      incrSettled = true;
      return 2;
    });
    const { invalidateUserResponseCacheImmediate } = await importCache();

    await invalidateUserResponseCacheImmediate("user-1");

    expect(redisMock.incr).toHaveBeenCalledExactlyOnceWith("cache:ver:user-1");
    // The bump must land before the caller's response is sent (serverless freeze).
    expect(incrSettled).toBe(true);
  });

  it("swallows Redis errors instead of failing the mutation", async () => {
    enableUpstash();
    redisMock.incr.mockRejectedValue(new Error("incr failed"));
    const { invalidateUserResponseCacheImmediate } = await importCache();

    await expect(invalidateUserResponseCacheImmediate("user-1")).resolves.toBeUndefined();
  });

  it("is a no-op when Redis is not configured", async () => {
    const { invalidateUserResponseCacheImmediate } = await importCache();

    await expect(invalidateUserResponseCacheImmediate("user-1")).resolves.toBeUndefined();
    expect(redisMock.incr).not.toHaveBeenCalled();
  });
});

describe("getUserCacheVersion", () => {
  it("returns the stored version for the user's key", async () => {
    enableUpstash();
    redisMock.get.mockResolvedValue(5);
    const { getUserCacheVersion } = await importCache();

    await expect(getUserCacheVersion("user-1")).resolves.toBe(5);
    expect(redisMock.get).toHaveBeenCalledWith("cache:ver:user-1");
  });

  it("defaults to 0 when no version is stored", async () => {
    enableUpstash();
    redisMock.get.mockResolvedValue(null);
    const { getUserCacheVersion } = await importCache();

    await expect(getUserCacheVersion("user-1")).resolves.toBe(0);
  });

  it("returns 0 when Redis is unavailable or the read throws", async () => {
    const { getUserCacheVersion } = await importCache();
    await expect(getUserCacheVersion("user-1")).resolves.toBe(0);

    vi.resetModules();
    enableUpstash();
    redisMock.get.mockRejectedValue(new Error("read failed"));
    const { getUserCacheVersion: withRedis } = await importCache();
    await expect(withRedis("user-1")).resolves.toBe(0);
  });
});
