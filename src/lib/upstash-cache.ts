import { Redis } from "@upstash/redis";

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
    console.error(`[Cache] version read failed for ${userId}:`, error);
    return 0;
  }
}

/** Bumps the user's cache generation so prior graph/analytics entries are ignored. */
export async function invalidateUserResponseCache(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.incr(`cache:ver:${userId}`);
  } catch (error) {
    console.error(`[Cache] invalidate failed for ${userId}:`, error);
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
      console.error(`[Cache] read failed for ${key}:`, error);
    }
  }

  const value = await compute();

  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
    } catch (error) {
      console.error(`[Cache] write failed for ${key}:`, error);
    }
  }

  return value;
}
