/**
 * Tag orbit: a dim body, a trace, and a square head.
 *
 * The trace is the Orbit mark scaled down to a token. Its tilt and how much
 * of the circle it covers come from the name, so a large library reads as a
 * set of instruments instead of a grid of identical dots. Color still
 * separates families; the trace separates tags whose colors sit close.
 *
 * Geometry is center-relative (origin at the middle of the token) so the
 * sidebar SVG and the map canvas draw the same orbit.
 */

export const TAG_MARK_DIM_ALPHA = 0.26;
/** Disc radius in the 16×16 viewBox. */
export const TAG_ORBIT_DISC = 7.15;
export const TAG_ORBIT_ARC = 5.05;
export const TAG_ORBIT_STROKE = 2.65;
export const TAG_ORBIT_HEAD = 3.7;
export const TAG_ORBIT_STARTS = 8;
export const TAG_ORBIT_SWEEPS = [95, 188, 305] as const;
export const TAG_ORBIT_PATTERN_COUNT = TAG_ORBIT_STARTS * TAG_ORBIT_SWEEPS.length;

const VIEW_CENTER = 8;

export interface TagOrbitGeometry {
  discRadius: number;
  arcRadius: number;
  arcWidth: number;
  /** Radians, 0 = east, clockwise in y-down space. */
  start: number;
  end: number;
  /** Square head, top-left, center-relative. */
  head: { x: number; y: number; size: number };
}

function normalizeKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function hashString(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash);
}

export function getTagOrbitGeometry(
  name: string | null | undefined,
  radius: number
): TagOrbitGeometry {
  const key = normalizeKey(name || "") || "untitled-tag";
  const tilt = hashString(key);
  const span = hashString(`${key}\0orbit`);
  const start = (tilt % TAG_ORBIT_STARTS) * ((Math.PI * 2) / TAG_ORBIT_STARTS);
  const sweepDeg = TAG_ORBIT_SWEEPS[span % TAG_ORBIT_SWEEPS.length] ?? TAG_ORBIT_SWEEPS[0];
  const sweep = (sweepDeg * Math.PI) / 180;
  const scale = radius / TAG_ORBIT_DISC;
  const arcRadius = TAG_ORBIT_ARC * scale;
  const headSize = TAG_ORBIT_HEAD * scale;
  const end = start + sweep;
  return {
    discRadius: radius,
    arcRadius,
    arcWidth: TAG_ORBIT_STROKE * scale,
    start,
    end,
    head: {
      x: arcRadius * Math.cos(end) - headSize / 2,
      y: arcRadius * Math.sin(end) - headSize / 2,
      size: headSize,
    },
  };
}

/** SVG arc for a center-relative orbit, shifted into a viewBox. */
export function tagOrbitArcPath(
  cx: number,
  cy: number,
  radius: number,
  start: number,
  end: number
) {
  const x1 = cx + radius * Math.cos(start);
  const y1 = cy + radius * Math.sin(start);
  const x2 = cx + radius * Math.cos(end);
  const y2 = cy + radius * Math.sin(end);
  const large = end - start > Math.PI ? 1 : 0;
  const n = (value: number) => value.toFixed(2);
  return `M ${n(x1)} ${n(y1)} A ${n(radius)} ${n(radius)} 0 ${large} 1 ${n(x2)} ${n(y2)}`;
}

export function tagOrbitViewOrigin() {
  return VIEW_CENTER;
}
