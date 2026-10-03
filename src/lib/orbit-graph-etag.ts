import { createHash } from "node:crypto";

/**
 * Graph payloads carry time-relative fields (`recent`, `ageDays`), so an
 * unchanged library still revalidates as fresh only within the same hour.
 */
export const ORBIT_GRAPH_ETAG_WINDOW_MS = 60 * 60 * 1000;

/**
 * A new deployment can change how the graph is built, so it invalidates
 * every outstanding ETag. Empty outside Vercel (local dev reloads anyway).
 */
const ORBIT_GRAPH_BUILD_ID =
  process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "";

/**
 * Identifies a graph by the user's cache generation (bumped by every library
 * write) rather than by one cached computation, so revalidating never needs
 * the payload: a match is a 304 even after the cached graph expired.
 */
export function buildOrbitGraphETag(input: {
  cacheVersion: number;
  scope: string;
  nodeCap: number;
  expandKey: string;
  now?: number;
  buildId?: string;
}) {
  const window = Math.floor(
    (input.now ?? Date.now()) / ORBIT_GRAPH_ETAG_WINDOW_MS
  );
  const digest = createHash("sha256")
    .update(
      [
        input.cacheVersion,
        input.scope,
        input.nodeCap,
        input.expandKey,
        window,
        input.buildId ?? ORBIT_GRAPH_BUILD_ID,
      ].join("|")
    )
    .digest("hex")
    .slice(0, 16);

  return `W/"orbit-graph-${digest}"`;
}
