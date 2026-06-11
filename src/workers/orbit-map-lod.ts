/**
 * Level-of-detail policy for the Orbit map (Google-Maps style).
 *
 * far  — only core + hubs with labels; bookmarks render as cluster halos
 * mid  — bookmark dots and edges fade in as zoom increases
 * near — full dots, hover targets, and (above the label zoom) bookmark labels
 */

import type { CameraState } from "@/lib/orbit-worker-protocol";

export type OrbitMapLodBand = "far" | "mid" | "near";

/** Below this zoom only hubs (and halos) are visible. */
export const ORBIT_MAP_LOD_FAR_MAX_ZOOM = 0.34;
/** At or above this zoom bookmarks are fully visible. */
export const ORBIT_MAP_LOD_NEAR_MIN_ZOOM = 0.9;

const BOOKMARK_FADE_END = 0.62;
const EDGE_FADE_START = 0.4;
const EDGE_FADE_END = 0.78;
const HALO_FADE_START = 0.3;
const HALO_FADE_END = 0.55;

export function getOrbitMapLodBand(zoom: number): OrbitMapLodBand {
  if (zoom < ORBIT_MAP_LOD_FAR_MAX_ZOOM) return "far";
  if (zoom < ORBIT_MAP_LOD_NEAR_MIN_ZOOM) return "mid";
  return "near";
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** 0 in the far band, ramping to 1 by mid-zoom. */
export function getOrbitMapBookmarkLodAlpha(zoom: number): number {
  return smoothstep(ORBIT_MAP_LOD_FAR_MAX_ZOOM, BOOKMARK_FADE_END, zoom);
}

/** Edge visibility ramp; non-focused edges are hidden when zoomed far out. */
export function getOrbitMapEdgeLodAlpha(zoom: number): number {
  return smoothstep(EDGE_FADE_START, EDGE_FADE_END, zoom);
}

/** Cluster halos are strongest far out and dissolve as dots fade in. */
export function getOrbitMapClusterHaloAlpha(zoom: number): number {
  return 1 - smoothstep(HALO_FADE_START, HALO_FADE_END, zoom);
}

export interface OrbitMapViewBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * World-space rect of the viewport with a relative margin on each side.
 * Used to cull offscreen nodes, edges, and labels.
 */
export function getOrbitMapViewBounds(
  camera: CameraState,
  viewportWidth: number,
  viewportHeight: number,
  marginFactor = 0.25
): OrbitMapViewBounds | null {
  if (camera.zoom <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return null;
  }
  const width = viewportWidth / camera.zoom;
  const height = viewportHeight / camera.zoom;
  const minX = -camera.x / camera.zoom - width * marginFactor;
  const minY = -camera.y / camera.zoom - height * marginFactor;
  return {
    minX,
    minY,
    maxX: minX + width * (1 + marginFactor * 2),
    maxY: minY + height * (1 + marginFactor * 2),
  };
}

/** Null bounds mean "no culling" (e.g. renderer not measured yet). */
export function isInOrbitMapViewBounds(
  x: number,
  y: number,
  bounds: OrbitMapViewBounds | null
): boolean {
  if (!bounds) return true;
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}
