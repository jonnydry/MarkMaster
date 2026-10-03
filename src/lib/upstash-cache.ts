import { after } from "next/server";

import { logError } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

function userCacheVersionKey(userId: string) {
  return `cache:ver:${userId}`;
}

export async function getUserCacheVersion(userId: string): Promise<number> {
  return (await readUserCacheVersion(userId)) ?? 0;
}

/**
 * The user's cache generation, or null when Redis can't vouch for it (not
 * configured, or the read failed). Callers that answer "nothing changed"
 * from the version alone must treat null as unknown, not as generation 0.
 */
export async function readUserCacheVersion(
  userId: string
): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const version = await redis.get<number>(userCacheVersionKey(userId));
    return version ?? 0;
  } catch (error) {
    logError("Cache", `version read failed for ${userId}`, error);
    return null;
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
    await redis.incr(userCacheVersionKey(userId));
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
    await writeCacheEntry(redis, key, value, ttlSeconds);
  }

  return value;
}

/** A per-user entry stamped with the cache generation it was computed under. */
type UserCacheEntry<T> = { v: number; data: T };

export type UserCacheLookup<T> = {
  /** The user's current cache generation, or null when Redis can't vouch for it. */
  version: number | null;
  /** The stored value when it belongs to `version`, else null. */
  value: T | null;
};

/**
 * Reads the generation and the entry in one Redis round trip, but returns the
 * entry only when its stamp matches. A stale entry stays in Redis (until its
 * TTL) and is not shipped back: after an invalidation the unversioned key
 * still holds the previous payload, which for the Orbit graph is hundreds of KB.
 * Never rejects: Redis errors read as an unknown generation and a miss.
 */
const LOOKUP_USER_CACHE_SCRIPT = `
local function generation(raw)
  if not raw or raw == false then
    return 0
  end
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and type(decoded) == "number" then
    return decoded
  end
  return tonumber(raw) or 0
end

local version = generation(redis.call("GET", KEYS[1]))
local raw = redis.call("GET", KEYS[2])
if not raw or raw == false then
  return cjson.encode({ v = version })
end
local ok, entry = pcall(cjson.decode, raw)
if ok and type(entry) == "table" and entry.v == version then
  return raw
end
return cjson.encode({ v = version })
`;

function parseUserCacheLookup<T>(result: unknown): UserCacheLookup<T> {
  let parsed: unknown = result;
  if (typeof result === "string") {
    try {
      parsed = JSON.parse(result);
    } catch {
      return { version: null, value: null };
    }
  }
  if (!parsed || typeof parsed !== "object") {
    return { version: null, value: null };
  }
  const entry = parsed as { v?: unknown; data?: T };
  if (typeof entry.v !== "number") return { version: null, value: null };
  const value = Object.prototype.hasOwnProperty.call(entry, "data")
    ? (entry.data ?? null)
    : null;
  return { version: entry.v, value };
}

export async function lookupUserCache<T>(
  userId: string,
  key: string
): Promise<UserCacheLookup<T>> {
  const redis = getRedis();
  if (!redis) return { version: null, value: null };

  try {
    const result = await redis.eval<[], unknown>(
      LOOKUP_USER_CACHE_SCRIPT,
      [userCacheVersionKey(userId), key],
      []
    );
    return parseUserCacheLookup<T>(result);
  } catch (error) {
    logError("Cache", `read failed for ${key}`, error);
    return { version: null, value: null };
  }
}

/**
 * Read-through cache for per-user responses, invalidated by
 * invalidateUserResponseCache. Pass `lookup` to overlap the cache read with
 * other work (e.g. a rate-limit check) before computing.
 */
export async function getUserCachedJson<T>(
  userId: string,
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
  lookup: Promise<UserCacheLookup<T>> = lookupUserCache<T>(userId, key)
): Promise<{ value: T; version: number | null }> {
  const { version, value: cached } = await lookup;
  if (cached !== null) return { value: cached, version };

  const value = await inFlightCompute(`${key}:v${version ?? "unknown"}`, compute);

  // An unknown generation must not be stamped as 0: that would publish a
  // payload under a generation Redis could not confirm.
  if (version !== null) {
    const redis = getRedis();
    if (redis) {
      const entry: UserCacheEntry<T> = { v: version, data: value };
      await writeCacheEntry(redis, key, entry, ttlSeconds);
    }
  }

  return { value, version };
}

/**
 * Cache fills don't need to block the response: inside a request, `after()`
 * runs the write once the response is sent (and keeps a serverless instance
 * alive for it). Outside a request scope (tests, scripts) `after` throws, so
 * the write runs inline instead.
 */
function writeCacheEntry(
  redis: NonNullable<ReturnType<typeof getRedis>>,
  key: string,
  value: unknown,
  ttlSeconds: number
) {
  return runAfterResponse(async () => {
    try {
      await redis.set(key, value, { ex: ttlSeconds });
    } catch (error) {
      logError("Cache", `write failed for ${key}`, error);
    }
  });
}

async function runAfterResponse(task: () => Promise<void>) {
  try {
    after(task);
  } catch {
    await task();
  }
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
