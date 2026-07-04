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

/** Push channel values away from luminance for a more electric read. */
export function saturateOrbitMapColor(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const saturate = (channel: number) =>
    Math.min(255, Math.max(0, Math.round(lum + (channel - lum) * amount)));
  return (saturate(r) << 16) | (saturate(g) << 8) | saturate(b);
}

function enhanceOrbitMapFill(color: number, isLightCanvas: boolean): number {
  const saturated = saturateOrbitMapColor(color, isLightCanvas ? 1.28 : 1.42);
  return isLightCanvas
    ? mixOrbitMapColors(saturated, 0xffffff, 0.06)
    : saturated;
}

function getOrbitMapNeonStroke(fill: number, isLightCanvas: boolean): number {
  const ringMix = isLightCanvas ? 0xffffff : 0x22d3ee;
  return mixOrbitMapColors(
    saturateOrbitMapColor(fill, isLightCanvas ? 1.18 : 1.3),
    ringMix,
    isLightCanvas ? 0.48 : 0.38
  );
}

function styleOrbitMapHub(
  fill: number,
  stroke: number,
  strokeWidth: number,
  isLightCanvas: boolean
): OrbitMapNodeVisualStyle {
  const color = enhanceOrbitMapFill(fill, isLightCanvas);
  return {
    color,
    strokeColor: getOrbitMapNeonStroke(stroke, isLightCanvas),
    strokeWidth,
    isHub: true,
  };
}

export function getOrbitMapNodeVisualStyle(
  node: OrbitGraphNode,
  palette?: OrbitMapPalette
): OrbitMapNodeVisualStyle {
  const isLightCanvas = (palette?.background ?? 0) > 0x808080;
  switch (node.kind) {
    case "core":
      return styleOrbitMapHub(0xfde047, 0xfef9c3, 2.3, isLightCanvas);
    case "tag": {
      const color = parseHexColor(node.color, 0x06d6a0);
      return styleOrbitMapHub(color, color, 2.2, isLightCanvas);
    }
    case "collection":
      return node.variant === "x_folder"
        ? styleOrbitMapHub(0xa855f7, 0xf0abfc, 2.2, isLightCanvas)
        : styleOrbitMapHub(0xec4899, 0xfda4af, 2.2, isLightCanvas);
    case "bookmark": {
      const accent = palette?.accent ?? 0x2f6fed;
      const color = node.affiliated
        ? isLightCanvas
          ? saturateOrbitMapColor(0x475569, 1.12)
          : 0x737373
        : enhanceOrbitMapFill(accent, isLightCanvas);
      const strokeColor = node.affiliated
        ? isLightCanvas
          ? saturateOrbitMapColor(0x64748b, 1.1)
          : 0xa3a3a3
        : getOrbitMapNeonStroke(color, isLightCanvas);
      // Fresh bookmarks pick up a cyan-hot edge instead of washing toward white.
      if (node.recent) {
        return {
          color: mixOrbitMapColors(color, 0x67e8f9, 0.14),
          strokeColor: mixOrbitMapColors(strokeColor, 0x67e8f9, 0.28),
          strokeWidth: (node.affiliated ? 0.9 : 1.2) + 0.25,
          isHub: false,
        };
      }
      return {
        color,
        strokeColor,
        strokeWidth: node.affiliated ? 0.9 : 1.25,
        isHub: false,
      };
    }
    case "overflow":
      return {
        color: enhanceOrbitMapFill(0xfb923c, isLightCanvas),
        strokeColor: getOrbitMapNeonStroke(0xfb923c, isLightCanvas),
        strokeWidth: 1.5,
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
