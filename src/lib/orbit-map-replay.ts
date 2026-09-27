import type { OrbitGraphPayload } from "@/types";

/** Longest history Replay plays back. */
export const ORBIT_MAP_REPLAY_MAX_DAYS = 730;
/** Shortest span worth replaying. */
const REPLAY_MIN_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * Days of history Replay can play for this graph: back to the oldest drawn
 * bookmark, capped at two years. Null when the payload has no save dates
 * (cached before `ageDays` existed) or nothing to replay.
 */
export function getOrbitMapReplayDays(
  graph: OrbitGraphPayload | null | undefined
): number | null {
  if (!graph) return null;
  let oldest = -1;
  for (const node of graph.nodes) {
    if (node.kind === "bookmark" && typeof node.ageDays === "number") {
      oldest = Math.max(oldest, node.ageDays);
    }
  }
  if (oldest < 0) return null;
  return Math.min(ORBIT_MAP_REPLAY_MAX_DAYS, Math.max(REPLAY_MIN_DAYS, Math.ceil(oldest)));
}

/** Months Replay covers, for the menu copy ("the last 18 months"). */
export function getOrbitMapReplayMonths(days: number): number {
  return Math.max(1, Math.round(days / 30.44));
}

/** "Mar 2025" for a replay cutoff, or "Today" at the end. */
export function formatOrbitMapReplayDate(cutoffDays: number, now = Date.now()): string {
  if (cutoffDays < 1) return "Today";
  return new Date(now - cutoffDays * DAY_MS).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
}
