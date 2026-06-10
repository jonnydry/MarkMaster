import type { OrbitGraphNode } from "@/types";

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

export function getOrbitMapNodeVisualStyle(
  node: OrbitGraphNode
): OrbitMapNodeVisualStyle {
  switch (node.kind) {
    case "core":
      return {
        color: 0xfacc15,
        strokeColor: 0xfef08a,
        strokeWidth: 2.2,
        isHub: true,
      };
    case "tag": {
      const color = parseHexColor(node.color, 0x34d399);
      return {
        color,
        strokeColor: color,
        strokeWidth: 2.1,
        isHub: true,
      };
    }
    case "collection":
      return {
        color: node.variant === "x_folder" ? 0xa78bfa : 0xf472b6,
        strokeColor: node.variant === "x_folder" ? 0xc4b5fd : 0xf9a8d4,
        strokeWidth: 2.1,
        isHub: true,
      };
    case "bookmark": {
      const color = node.affiliated ? 0x737373 : 0x2f6fed;
      return {
        color,
        strokeColor: node.affiliated ? 0xa3a3a3 : 0xbfdbfe,
        strokeWidth: node.affiliated ? 0.9 : 1.2,
        isHub: false,
      };
    }
    case "overflow":
      return {
        color: 0xf97316,
        strokeColor: 0xfdba74,
        strokeWidth: 1.4,
        isHub: false,
      };
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
    // Hubs connected to the selection are always worth naming; bookmark
    // neighbors only label once moderately zoomed in, or selecting a large
    // hub floods the canvas with handles.
    if (isHub) return true;
    if (kind === "bookmark") return zoom >= ORBIT_MAP_BOOKMARK_LABEL_ZOOM / 2;
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
    return "Orbit";
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
