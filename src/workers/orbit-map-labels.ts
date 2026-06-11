/**
 * Screen-space label decluttering for the Orbit map.
 *
 * Candidates are bucketed into a coarse screen grid; only the highest-priority
 * candidate per cell survives, so dense areas never render overlapping labels.
 */

import type { OrbitGraphNode } from "@/types";

export interface OrbitMapLabelCandidate {
  id: string;
  /** Screen-space coordinates (CSS pixels relative to the canvas). */
  x: number;
  y: number;
  priority: number;
}

export interface OrbitMapLabelGridOptions {
  cellSize: number;
  width: number;
  height: number;
  /** Extra screen margin within which offscreen labels are still kept. */
  margin?: number;
}

export const ORBIT_MAP_LABEL_CELL_SIZE = 76;

export function getOrbitMapLabelPriority(
  kind: OrbitGraphNode["kind"],
  options: {
    isActive?: boolean;
    isSelectedNeighbor?: boolean;
    /** 0-based rank among hubs sorted by count (lower = more important). */
    importanceRank?: number;
    recent?: boolean;
  } = {}
): number {
  if (options.isActive) return 1_000_000;
  switch (kind) {
    case "core":
      return 5000;
    case "tag":
    case "collection":
      return 4000 - Math.min(options.importanceRank ?? 999, 999);
    case "overflow":
      return 800;
    case "bookmark":
      if (options.isSelectedNeighbor) return 1500;
      return options.recent ? 120 : 100;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/**
 * Returns the ids of candidates that win their grid cell. Offscreen
 * candidates (beyond the margin) are dropped entirely.
 */
export function declutterOrbitMapLabels(
  candidates: OrbitMapLabelCandidate[],
  options: OrbitMapLabelGridOptions
): Set<string> {
  const margin = options.margin ?? 48;
  const cellSize = Math.max(options.cellSize, 8);
  const best = new Map<string, OrbitMapLabelCandidate>();

  for (const candidate of candidates) {
    if (
      candidate.x < -margin ||
      candidate.x > options.width + margin ||
      candidate.y < -margin ||
      candidate.y > options.height + margin
    ) {
      continue;
    }
    const key = `${Math.floor(candidate.x / cellSize)}:${Math.floor(candidate.y / cellSize)}`;
    const current = best.get(key);
    if (!current || candidate.priority > current.priority) {
      best.set(key, candidate);
    }
  }

  const winners = new Set<string>();
  for (const candidate of best.values()) {
    winners.add(candidate.id);
  }
  return winners;
}
