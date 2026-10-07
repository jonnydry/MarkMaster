import { describe, expect, it } from "vitest";

import {
  TAG_ORBIT_DISC,
  TAG_ORBIT_PATTERN_COUNT,
  TAG_ORBIT_SWEEPS,
  getTagOrbitGeometry,
  tagOrbitArcPath,
} from "@/lib/tag-mark";

describe("tag orbits", () => {
  it("keeps a stable trace for a name", () => {
    const a = getTagOrbitGeometry("Research", TAG_ORBIT_DISC);
    const b = getTagOrbitGeometry("  research ", TAG_ORBIT_DISC);
    expect(a.start).toBe(b.start);
    expect(a.end).toBe(b.end);
    expect(a.head).toEqual(b.head);
  });

  it("uses one of the three spans", () => {
    const sweep = getTagOrbitGeometry("Design", TAG_ORBIT_DISC);
    const degrees = Math.round(((sweep.end - sweep.start) * 180) / Math.PI);
    expect(TAG_ORBIT_SWEEPS).toContain(degrees);
  });

  it("spreads a large library across every tilt and span", () => {
    const keys = new Set(
      Array.from({ length: 480 }, (_, index) => {
        const mark = getTagOrbitGeometry(`Topic ${index}`, TAG_ORBIT_DISC);
        const tilt = Math.round((mark.start * 180) / Math.PI);
        const span = Math.round(((mark.end - mark.start) * 180) / Math.PI);
        return `${tilt}-${span}`;
      })
    );
    expect(keys.size).toBe(TAG_ORBIT_PATTERN_COUNT);
  });

  it("keeps the head inside the token", () => {
    for (let index = 0; index < 240; index += 1) {
      const mark = getTagOrbitGeometry(`Topic ${index}`, TAG_ORBIT_DISC);
      const corners = [0, mark.head.size].flatMap((dx) =>
        [0, mark.head.size].map((dy) => [mark.head.x + dx, mark.head.y + dy] as const)
      );
      for (const [x, y] of corners) {
        expect(Math.max(Math.abs(x), Math.abs(y))).toBeLessThanOrEqual(8);
      }
    }
  });

  it("builds a clockwise arc path", () => {
    const mark = getTagOrbitGeometry("Orbit", TAG_ORBIT_DISC);
    const path = tagOrbitArcPath(8, 8, mark.arcRadius, mark.start, mark.end);
    expect(path.startsWith("M ")).toBe(true);
    expect(path).toContain(" A ");
  });
});
