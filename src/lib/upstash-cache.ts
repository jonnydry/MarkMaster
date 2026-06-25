import { Redis } from "@upstash/redis";
import { logError } from "@/lib/logger";

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!_redis && process.env.UPSTASH_REDIS_REST_URL) {
    _redis = Redis.fromEnv();
  }
  return _redis;
}

export async function getUserCacheVersion(userId: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;

  try {
    const version = await redis.get<number>(`cache:ver:${userId}`);
    return version ?? 0;
  } catch (error) {
    logError("Cache", `version read failed for ${userId}`, error);
    return 0;
  }
}

/** Per-user debounce map: collapses rapid-fire invalidations into one bump. */
const invalidationTimers = new Map<string, NodeJS.Timeout>();
const INVALIDATION_DEBOUNCE_MS = 2_000;

/**
 * Bumps the user's cache generation so prior graph/analytics entries are ignored.
 * Debounced: a burst of invalidations within INVALIDATION_DEBOUNCE_MS coalesces
 * into a single Redis write per user, eliminating cache-stampede churn.
 */
export function invalidateUserResponseCache(userId: string): void {
  const existing = invalidationTimers.get(userId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    invalidationTimers.delete(userId);
    void flushInvalidateUserResponseCache(userId);
  }, INVALIDATION_DEBOUNCE_MS);

  invalidationTimers.set(userId, timer);
}

async function flushInvalidateUserResponseCache(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.incr(`cache:ver:${userId}`);
  } catch (error) {
    logError("Cache", `invalidate failed for ${userId}`, error);
  }
}

/** Read-through JSON cache with fail-open behavior when Redis is unavailable. */
export async function getCachedJson<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<T> {
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get<string>(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
  } catch (error) {
    logError("Cache", `read failed for ${key}`, error);
  }
  }

  const value = await inFlightCompute(key, compute);

  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
  } catch (error) {
    logError("Cache", `write failed for ${key}`, error);
  }
  }

  return value;
}

/**
 * Single-flight: when multiple concurrent callers miss the cache for the same
 * key, only the first actually runs compute(); the rest await the same promise.
 * Prevents stampedes on a freshly-bumped cache version.
 */
const inflight = new Map<string, Promise<unknown>>();

function inFlightCompute<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = compute().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}
