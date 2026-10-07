import type { OrbitGraphNode } from "@/types";
import type { OrbitMapPalette } from "@/lib/orbit-map-palette";

export interface OrbitMapNodeVisualStyle {
  color: number;
  strokeColor: number;
  strokeWidth: number;
  isHub: boolean;
}

function parseHexColor(value: string | undefined, fallback: number) {
  const normalized = value?.replace("#", "").trim();
  if (!normalized || !/^[0-9a-fA-F]{6}$/.test(normalized)) return fallback;
  return Number.parseInt(normalized, 16);
}

/**
 * Flat glyph colours on the neutral canvas. The accent (`palette.glow`) is
 * reserved for the queue and loose bookmarks; tags keep the user's colour
 * (the worker paints that colour as an orbit trace, not a solid disc); collections
 * are neutral ink. Filed dots start neutral and take a calm tint of their
 * home tag in the worker (applyBookmarkAccentColors).
 */
export function getOrbitMapNodeVisualStyle(
  node: OrbitGraphNode,
  palette?: OrbitMapPalette
): OrbitMapNodeVisualStyle {
  const isLightCanvas = (palette?.background ?? 0) > 0x808080;
  const glow = palette?.glow ?? (isLightCanvas ? 0x2563eb : 0x5b8def);
  const neutral = palette?.neutral ?? (isLightCanvas ? 0x56606b : 0x8d9299);
  const ink = palette?.ink ?? (isLightCanvas ? 0x0f1419 : 0xececec);
  switch (node.kind) {
    case "core":
      return { color: glow, strokeColor: glow, strokeWidth: 2.4, isHub: true };
    case "tag": {
      const color = parseHexColor(node.color, neutral);
      return { color, strokeColor: color, strokeWidth: 0, isHub: true };
    }
    case "collection":
      return {
        color: ink,
        strokeColor: ink,
        strokeWidth: node.variant === "x_folder" ? 2 : 0,
        isHub: true,
      };
    case "bookmark":
      return node.affiliated
        ? { color: neutral, strokeColor: neutral, strokeWidth: 0, isHub: false }
        : { color: glow, strokeColor: glow, strokeWidth: 1.5, isHub: false };
    case "overflow":
      return { color: neutral, strokeColor: neutral, strokeWidth: 0, isHub: false };
  }
}

export function getOrbitMapNodeRadius(node: OrbitGraphNode) {
  switch (node.kind) {
    case "core":
      return 13;
    case "tag":
      return 8 + Math.min(7, Math.sqrt(Math.max(0, node.count)) * 0.72);
    case "collection":
      return 8 + Math.min(6, Math.sqrt(Math.max(0, node.count)) * 0.68);
    case "bookmark":
      return node.affiliated ? 5.4 : 5.8;
    case "overflow":
      return 7;
  }
}

/** The N most-connected hubs keep their labels at every zoom level. */
export const ORBIT_MAP_TOP_HUB_LABEL_COUNT = 12;

/** Zoom level at which bookmark @handle labels appear. */
export const ORBIT_MAP_BOOKMARK_LABEL_ZOOM = 1.2;

export function shouldShowOrbitMapLabel(
  kind: OrbitGraphNode["kind"],
  zoom: number,
  threshold: number,
  options: {
    isActive?: boolean;
    isSelectedNeighbor?: boolean;
    /** 0-based rank among hubs sorted by count; top hubs are always labeled. */
    importanceRank?: number;
  } = {}
) {
  if (options.isActive) {
    return true;
  }

  const isHub = kind === "core" || kind === "tag" || kind === "collection";

  if (options.isSelectedNeighbor) {
    // Hubs connected to the selection are always worth naming. Bookmark
    // neighbors follow the normal zoom rule: the hairlines already show which
    // ones are related, and a large hub would flood the canvas with handles.
    if (isHub) return true;
    if (kind === "bookmark") return zoom >= ORBIT_MAP_BOOKMARK_LABEL_ZOOM;
    return true;
  }

  if (isHub) {
    if ((options.importanceRank ?? Infinity) < ORBIT_MAP_TOP_HUB_LABEL_COUNT) {
      return true;
    }
    return zoom >= threshold;
  }
  if (kind === "bookmark") {
    return zoom >= ORBIT_MAP_BOOKMARK_LABEL_ZOOM;
  }
  if (kind === "overflow") {
    return zoom >= threshold;
  }
  return false;
}

export function getOrbitMapLabelText(node: OrbitGraphNode) {
  if (node.kind === "tag" || node.kind === "collection") {
    return node.name.length > 24 ? `${node.name.slice(0, 21)}...` : node.name;
  }
  if (node.kind === "bookmark") {
    const handle = node.authorUsername?.trim();
    return handle && handle !== "unknown" ? `@${handle}` : "Bookmark";
  }
  if (node.kind === "overflow") {
    return `+${node.remaining}`;
  }
  if (node.kind === "core") {
    return "Orbit queue";
  }
  return "Node";
}

/** Channel-wise linear blend between two 0xRRGGBB colors (t=0 → a, t=1 → b). */
export function mixOrbitMapColors(a: number, b: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const mix = (shift: number) => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * clamped) << shift;
  };
  return mix(16) | mix(8) | mix(0);
}
