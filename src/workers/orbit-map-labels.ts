/**
 * Screen-space label decluttering for the Orbit map.
 *
 * Candidates are placed greedily by priority; a label survives only if its
 * on-screen box clears every label already placed, so dense areas never
 * render overlapping text.
 */

import type { OrbitGraphNode } from "@/types";

export interface OrbitMapLabelCandidate {
  id: string;
  /**
   * Screen-space anchor (CSS pixels relative to the canvas): the label's
   * bottom-center, i.e. where its baseline box sits above the node.
   */
  x: number;
  y: number;
  priority: number;
  /** On-screen label box; defaults to a `cellSize` square. */
  width?: number;
  height?: number;
}

export interface OrbitMapLabelGridOptions {
  /** Spatial-hash cell size, and the default box for unsized candidates. */
  cellSize: number;
  width: number;
  height: number;
  /** Extra screen margin within which offscreen labels are still kept. */
  margin?: number;
}

export const ORBIT_MAP_LABEL_CELL_SIZE = 76;

/**
 * On-screen font size (CSS px) for a label. Hub names read like the app's
 * 13px section labels; bookmark handles sit a step below at 11px.
 */
export function getOrbitMapLabelScreenSize(
  isHub: boolean,
  state: "active" | "neighbor" | "default"
): number {
  if (isHub) return state === "active" ? 14 : 13;
  return state === "active" ? 12 : 11;
}

/** Approximate on-screen box of a single-line label, for overlap checks. */
export function estimateOrbitMapLabelBox(text: string, fontSize: number) {
  return {
    width: text.length * fontSize * 0.58 + 6,
    height: fontSize * 1.3,
  };
}

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
 * Returns the ids of candidates whose label boxes fit without overlapping a
 * higher-priority label. Offscreen candidates (beyond the margin) are dropped
 * entirely.
 */
export function declutterOrbitMapLabels(
  candidates: OrbitMapLabelCandidate[],
  options: OrbitMapLabelGridOptions
): Set<string> {
  const margin = options.margin ?? 48;
  const cellSize = Math.max(options.cellSize, 8);

  const onScreen = candidates.filter(
    (candidate) =>
      candidate.x >= -margin &&
      candidate.x <= options.width + margin &&
      candidate.y >= -margin &&
      candidate.y <= options.height + margin
  );
  // Stable sort: equal priorities keep input order, so ties don't flicker.
  onScreen.sort((a, b) => b.priority - a.priority);

  type Box = { minX: number; minY: number; maxX: number; maxY: number };
  const buckets = new Map<string, Box[]>();
  const winners = new Set<string>();

  for (const candidate of onScreen) {
    const width = candidate.width ?? cellSize;
    const height = candidate.height ?? cellSize;
    const box: Box = {
      minX: candidate.x - width / 2,
      maxX: candidate.x + width / 2,
      minY: candidate.y - height,
      maxY: candidate.y,
    };

    const minCellX = Math.floor(box.minX / cellSize);
    const maxCellX = Math.floor(box.maxX / cellSize);
    const minCellY = Math.floor(box.minY / cellSize);
    const maxCellY = Math.floor(box.maxY / cellSize);

    let collides = false;
    for (let cx = minCellX; cx <= maxCellX && !collides; cx += 1) {
      for (let cy = minCellY; cy <= maxCellY && !collides; cy += 1) {
        const placed = buckets.get(`${cx}:${cy}`);
        if (!placed) continue;
        for (const other of placed) {
          if (
            box.minX < other.maxX &&
            box.maxX > other.minX &&
            box.minY < other.maxY &&
            box.maxY > other.minY
          ) {
            collides = true;
            break;
          }
        }
      }
    }
    if (collides) continue;

    winners.add(candidate.id);
    for (let cx = minCellX; cx <= maxCellX; cx += 1) {
      for (let cy = minCellY; cy <= maxCellY; cy += 1) {
        const key = `${cx}:${cy}`;
        const placed = buckets.get(key);
        if (placed) placed.push(box);
        else buckets.set(key, [box]);
      }
    }
  }

  return winners;
}
