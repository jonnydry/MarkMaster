import { logError } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

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

/**
 * Bumps the user's cache generation so prior graph/analytics entries are ignored.
 *
 * Awaits the Redis write before returning: on serverless the instance can be
 * frozen as soon as the response is sent, so a deferred (setTimeout) bump may
 * never fire — and the client refetches immediately after a mutation response,
 * so the bump must land before we respond anyway. A single INCR per mutation
 * is cheap; read-side stampedes are already handled by inFlightCompute.
 */
export async function invalidateUserResponseCache(userId: string): Promise<void> {
  await flushInvalidateUserResponseCache(userId);
}

/** Alias kept for call sites that want to be explicit about immediacy. */
export const invalidateUserResponseCacheImmediate = invalidateUserResponseCache;

async function flushInvalidateUserResponseCache(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.incr(`cache:ver:${userId}`);
  } catch (error) {
    logError("Cache", `invalidate failed for ${userId}`, error);
  }
}

/**
 * Read-through JSON cache with fail-open behavior when Redis is unavailable.
 *
 * Serialization is left entirely to the Upstash client: its default
 * serializer JSON.stringifies non-string values on SET and its default
 * automaticDeserialization JSON.parses on GET. Do NOT re-add a manual
 * JSON.stringify/JSON.parse layer here — the client's GET already returns a
 * parsed object, so a manual JSON.parse(object) throws, gets swallowed by
 * the fail-open handler, and silently turns every read into a cache miss.
 */
export async function getCachedJson<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<T> {
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get<T>(key);
      if (cached !== null && cached !== undefined) {
        return cached;
      }
    } catch (error) {
      logError("Cache", `read failed for ${key}`, error);
    }
  }

  const value = await inFlightCompute(key, compute);

  if (redis) {
    try {
      await redis.set(key, value, { ex: ttlSeconds });
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
