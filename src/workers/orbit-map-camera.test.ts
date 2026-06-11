import { describe, expect, it } from "vitest";

import {
  clampOrbitMapZoom,
  constrainOrbitMapCameraState,
  getOrbitMapFitZoom,
  getOrbitMapFrameCameraState,
  getOrbitMapGraphBounds,
} from "./orbit-map-camera";

const config = {
  minZoom: 0.12,
  maxZoom: 1.85,
  maxFitZoom: 1.75,
  framePadding: 72,
  nodePadding: 18,
  viewportWidth: 800,
  viewportHeight: 600,
};

describe("orbit map camera helpers", () => {
  it("calculates bounds from node radii and padding", () => {
    expect(
      getOrbitMapGraphBounds(
        [
          { x: -10, y: 0, radius: 2 },
          { x: 30, y: 20, radius: 4 },
        ],
        8
      )
    ).toEqual({ minX: -20, maxX: 42, minY: -10, maxY: 32 });
  });

  it("clamps zoom to the configured camera range", () => {
    const bounds = { minX: -100, maxX: 100, minY: -100, maxY: 100 };

    expect(clampOrbitMapZoom(20, bounds, config)).toBe(1.85);
    expect(clampOrbitMapZoom(0.01, bounds, config)).toBe(
      getOrbitMapFitZoom(bounds, config)
    );
  });

  it("keeps small graphs centered in frame", () => {
    const camera = constrainOrbitMapCameraState(
      { x: 10, y: 20, zoom: 1 },
      { minX: -50, maxX: 50, minY: -25, maxY: 25 },
      config
    );

    expect(camera.x).toBe(400);
    expect(camera.y).toBe(300);
  });

  it("frames bounds centered at their fit zoom (cluster fly-to)", () => {
    const bounds = { minX: 100, maxX: 300, minY: 50, maxY: 250 };
    const camera = getOrbitMapFrameCameraState(bounds, config);

    expect(camera.zoom).toBe(getOrbitMapFitZoom(bounds, config));
    // The bounds center (200, 150) lands at the viewport center (400, 300).
    expect(camera.x + 200 * camera.zoom).toBeCloseTo(400);
    expect(camera.y + 150 * camera.zoom).toBeCloseTo(300);
  });

  it("respects a lowered maxFitZoom when framing small clusters", () => {
    const bounds = { minX: -40, maxX: 40, minY: -40, maxY: 40 };
    const camera = getOrbitMapFrameCameraState(bounds, {
      ...config,
      maxFitZoom: 1.25,
    });

    expect(camera.zoom).toBe(1.25);
  });
});
