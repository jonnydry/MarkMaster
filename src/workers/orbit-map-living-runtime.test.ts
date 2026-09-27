import { describe, expect, it } from "vitest";

import {
  getOrbitMapRingOmega,
  ORBIT_MAP_INNER_RING_PERIOD_S,
} from "./orbit-map-living-runtime";

describe("getOrbitMapRingOmega", () => {
  it("keeps quiet discs still", () => {
    expect(getOrbitMapRingOmega("tag-a", 40, 30, 0)).toBe(0);
    expect(getOrbitMapRingOmega(null, 40, 30, 1)).toBe(0);
  });

  it("turns the innermost ring of a fully active disc once per period", () => {
    const omega = Math.abs(getOrbitMapRingOmega("tag-a", 30, 30, 1));
    expect(omega).toBeCloseTo((Math.PI * 2) / ORBIT_MAP_INNER_RING_PERIOD_S, 6);
  });

  it("turns inner rings faster than outer ones, Kepler-style", () => {
    const inner = Math.abs(getOrbitMapRingOmega("tag-a", 30, 30, 1));
    const outer = Math.abs(getOrbitMapRingOmega("tag-a", 120, 30, 1));
    // (30 / 120) ^ 1.5 = 1/8
    expect(outer).toBeCloseTo(inner / 8, 6);
  });

  it("scales with activity and keeps one direction per disc", () => {
    const busy = getOrbitMapRingOmega("tag-a", 30, 30, 1);
    const calm = getOrbitMapRingOmega("tag-a", 30, 30, 0.3);
    expect(calm / busy).toBeCloseTo(0.3, 6);
    expect(Math.sign(calm)).toBe(Math.sign(busy));
  });
});
