import { describe, expect, it } from "vitest";

import {
  getOrbitMapBookmarkLodAlpha,
  getOrbitMapClusterHaloAlpha,
  getOrbitMapEdgeLodAlpha,
  getOrbitMapLodBand,
  getOrbitMapViewBounds,
  isInOrbitMapViewBounds,
  ORBIT_MAP_LOD_FAR_MAX_ZOOM,
  ORBIT_MAP_LOD_NEAR_MIN_ZOOM,
} from "./orbit-map-lod";

describe("getOrbitMapLodBand", () => {
  it("selects far/mid/near by zoom thresholds", () => {
    expect(getOrbitMapLodBand(0.12)).toBe("far");
    expect(getOrbitMapLodBand(ORBIT_MAP_LOD_FAR_MAX_ZOOM - 0.01)).toBe("far");
    expect(getOrbitMapLodBand(ORBIT_MAP_LOD_FAR_MAX_ZOOM)).toBe("mid");
    expect(getOrbitMapLodBand(ORBIT_MAP_LOD_NEAR_MIN_ZOOM - 0.01)).toBe("mid");
    expect(getOrbitMapLodBand(ORBIT_MAP_LOD_NEAR_MIN_ZOOM)).toBe("near");
    expect(getOrbitMapLodBand(1.85)).toBe("near");
  });
});

describe("LOD alpha ramps", () => {
  it("hides bookmarks in the far band and shows them fully when near", () => {
    expect(getOrbitMapBookmarkLodAlpha(0.12)).toBe(0);
    expect(getOrbitMapBookmarkLodAlpha(ORBIT_MAP_LOD_FAR_MAX_ZOOM)).toBe(0);
    expect(getOrbitMapBookmarkLodAlpha(0.5)).toBeGreaterThan(0);
    expect(getOrbitMapBookmarkLodAlpha(0.5)).toBeLessThan(1);
    expect(getOrbitMapBookmarkLodAlpha(1)).toBe(1);
  });

  it("ramps monotonically with zoom", () => {
    let previous = -1;
    for (let zoom = 0.1; zoom <= 1.9; zoom += 0.1) {
      const alpha = getOrbitMapBookmarkLodAlpha(zoom);
      expect(alpha).toBeGreaterThanOrEqual(previous);
      previous = alpha;
    }
  });

  it("fades edges out before bookmarks fully disappear", () => {
    expect(getOrbitMapEdgeLodAlpha(0.2)).toBe(0);
    expect(getOrbitMapEdgeLodAlpha(1)).toBe(1);
    expect(getOrbitMapEdgeLodAlpha(0.5)).toBeLessThan(
      getOrbitMapBookmarkLodAlpha(0.5)
    );
  });

  it("shows cluster halos far out and dissolves them as dots fade in", () => {
    expect(getOrbitMapClusterHaloAlpha(0.12)).toBe(1);
    expect(getOrbitMapClusterHaloAlpha(1)).toBe(0);
    const mid = getOrbitMapClusterHaloAlpha(0.45);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe("view bounds", () => {
  it("computes the world rect of the viewport", () => {
    const bounds = getOrbitMapViewBounds({ x: -40, y: 30, zoom: 1 }, 800, 600, 0);
    expect(bounds).toEqual({ minX: 40, minY: -30, maxX: 840, maxY: 570 });
  });

  it("accounts for camera offset, zoom, and margin", () => {
    const bounds = getOrbitMapViewBounds(
      { x: 100, y: -50, zoom: 2 },
      800,
      600,
      0.25
    );
    // World rect: left = -100/2 = -50, width = 400 (margin 100 each side);
    // top = 50/2 = 25, height = 300 (margin 75 each side).
    expect(bounds).toEqual({ minX: -150, minY: -50, maxX: 450, maxY: 400 });
  });

  it("returns null for degenerate cameras and treats null as no culling", () => {
    expect(getOrbitMapViewBounds({ x: 0, y: 0, zoom: 0 }, 800, 600)).toBeNull();
    expect(isInOrbitMapViewBounds(99999, 99999, null)).toBe(true);
  });

  it("culls points outside the bounds", () => {
    const bounds = getOrbitMapViewBounds({ x: 0, y: 0, zoom: 1 }, 800, 600, 0);
    expect(isInOrbitMapViewBounds(400, 300, bounds)).toBe(true);
    expect(isInOrbitMapViewBounds(-1, 300, bounds)).toBe(false);
    expect(isInOrbitMapViewBounds(400, 601, bounds)).toBe(false);
  });
});
