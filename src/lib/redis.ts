import { Redis } from "@upstash/redis";

/**
 * Shared lazy Upstash Redis singleton for Node-side modules
 * (rate limiting, response cache).
 *
 * Only created when Upstash credentials are actually present, which prevents
 * noisy "[Upstash Redis] Unable to find environment variable" warnings and
 * lets callers fail open (cache) or apply their own env-based policy
 * (rate limiting) when Redis is unconfigured.
 *
 * Note: src/proxy.ts keeps its own client on purpose — it runs in a separate
 * (proxy) runtime and must not import Node-side lib modules.
 */
let _redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (!_redis && process.env.UPSTASH_REDIS_REST_URL) {
    _redis = Redis.fromEnv();
  }
  return _redis;
}
