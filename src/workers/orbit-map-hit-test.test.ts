import { describe, expect, it } from "vitest";

import {
  createOrbitMapSpatialIndex,
  findClosestOrbitMapNode,
  getOrbitMapHitPadding,
} from "./orbit-map-hit-test";

describe("findClosestOrbitMapNode", () => {
  it("returns the closest node within the padded hit radius", () => {
    const nodes = [
      { id: "far", x: 60, y: 60, radius: 4 },
      { id: "near", x: 10, y: 0, radius: 4 },
    ];

    expect(findClosestOrbitMapNode(nodes, { x: 13, y: 0 }, 8)?.id).toBe(
      "near"
    );
  });

  it("returns null when no node is within range", () => {
    expect(
      findClosestOrbitMapNode([{ id: "node", x: 100, y: 100, radius: 4 }], {
        x: 0,
        y: 0,
      }, 8)
    ).toBeNull();
  });
});

describe("createOrbitMapSpatialIndex", () => {
  it("matches the linear scan on a crowded sky", () => {
    const nodes = Array.from({ length: 80 }, (_, index) => ({
      id: `n-${index}`,
      x: (index % 10) * 40,
      y: Math.floor(index / 10) * 40,
      radius: 4,
    }));
    const index = createOrbitMapSpatialIndex<typeof nodes[number]>();
    index.rebuild(nodes);

    const point = { x: 122, y: 81 };
    expect(index.query(point, 8)?.id).toBe(
      findClosestOrbitMapNode(nodes, point, 8)?.id
    );
    expect(index.query({ x: -200, y: -200 }, 8)).toBeNull();
  });
});

describe("getOrbitMapHitPadding", () => {
  it("uses the base padding at near zoom where targets are already large", () => {
    expect(getOrbitMapHitPadding(2)).toBe(10);
    expect(getOrbitMapHitPadding(1.4)).toBe(10);
  });

  it("grows the world padding as zoom decreases to keep a constant screen target", () => {
    // 14 screen px / zoom — padded target stays clickable when zoomed out.
    expect(getOrbitMapHitPadding(0.5)).toBe(28);
    expect(getOrbitMapHitPadding(0.25)).toBe(56);
  });

  it("respects a larger base padding (drop targets)", () => {
    expect(getOrbitMapHitPadding(2, 14)).toBe(14);
    expect(getOrbitMapHitPadding(0.5, 14)).toBe(28);
  });

  it("falls back to base padding for non-positive zoom", () => {
    expect(getOrbitMapHitPadding(0)).toBe(10);
  });
});
