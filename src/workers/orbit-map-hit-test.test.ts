import { describe, expect, it } from "vitest";

import { findClosestOrbitMapNode } from "./orbit-map-hit-test";

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
