import { describe, expect, it } from "vitest";

import {
  declutterOrbitMapLabels,
  getOrbitMapLabelPriority,
  type OrbitMapLabelCandidate,
} from "./orbit-map-labels";

const gridOptions = { cellSize: 80, width: 800, height: 600 };

describe("declutterOrbitMapLabels", () => {
  it("keeps only the highest-priority candidate per grid cell", () => {
    const candidates: OrbitMapLabelCandidate[] = [
      { id: "hub", x: 100, y: 100, priority: 4000 },
      { id: "bookmark-1", x: 110, y: 105, priority: 100 },
      { id: "bookmark-2", x: 120, y: 110, priority: 120 },
    ];

    const winners = declutterOrbitMapLabels(candidates, gridOptions);
    expect(winners).toEqual(new Set(["hub"]));
  });

  it("keeps candidates in different cells", () => {
    const candidates: OrbitMapLabelCandidate[] = [
      { id: "a", x: 40, y: 40, priority: 100 },
      { id: "b", x: 400, y: 300, priority: 100 },
      { id: "c", x: 700, y: 500, priority: 100 },
    ];

    const winners = declutterOrbitMapLabels(candidates, gridOptions);
    expect(winners).toEqual(new Set(["a", "b", "c"]));
  });

  it("drops a sized label that overlaps a higher-priority one, keeps clear ones", () => {
    const candidates: OrbitMapLabelCandidate[] = [
      // A wide hub label spanning several grid cells.
      { id: "hub", x: 200, y: 200, priority: 4000, width: 160, height: 15 },
      // Two cells to the right, but still under the hub label's box.
      { id: "under-hub", x: 265, y: 205, priority: 100, width: 60, height: 13 },
      // Just clears the hub label's right edge.
      { id: "beside", x: 320, y: 200, priority: 100, width: 60, height: 13 },
      // Directly below the hub label's baseline.
      { id: "below", x: 200, y: 220, priority: 100, width: 60, height: 13 },
    ];

    const winners = declutterOrbitMapLabels(candidates, gridOptions);
    expect(winners).toEqual(new Set(["hub", "beside", "below"]));
  });

  it("drops candidates outside the screen (plus margin)", () => {
    const candidates: OrbitMapLabelCandidate[] = [
      { id: "visible", x: 400, y: 300, priority: 100 },
      { id: "just-outside", x: 800 + 20, y: 300, priority: 100 },
      { id: "far-outside", x: 2000, y: 300, priority: 9999 },
      { id: "above", x: 400, y: -500, priority: 9999 },
    ];

    const winners = declutterOrbitMapLabels(candidates, {
      ...gridOptions,
      margin: 48,
    });
    // The margin keeps near-edge labels, but far-offscreen ones are culled.
    expect(winners.has("visible")).toBe(true);
    expect(winners.has("just-outside")).toBe(true);
    expect(winners.has("far-outside")).toBe(false);
    expect(winners.has("above")).toBe(false);
  });
});

describe("getOrbitMapLabelPriority", () => {
  it("orders active > hubs > selected neighbors > bookmarks", () => {
    const active = getOrbitMapLabelPriority("bookmark", { isActive: true });
    const hub = getOrbitMapLabelPriority("tag", { importanceRank: 0 });
    const neighbor = getOrbitMapLabelPriority("bookmark", {
      isSelectedNeighbor: true,
    });
    const recent = getOrbitMapLabelPriority("bookmark", { recent: true });
    const bookmark = getOrbitMapLabelPriority("bookmark");

    expect(active).toBeGreaterThan(hub);
    expect(hub).toBeGreaterThan(neighbor);
    expect(neighbor).toBeGreaterThan(recent);
    expect(recent).toBeGreaterThan(bookmark);
  });

  it("ranks more important hubs above less important ones", () => {
    expect(
      getOrbitMapLabelPriority("tag", { importanceRank: 0 })
    ).toBeGreaterThan(getOrbitMapLabelPriority("tag", { importanceRank: 5 }));
  });

  it("prioritizes the core above all hubs", () => {
    expect(getOrbitMapLabelPriority("core")).toBeGreaterThan(
      getOrbitMapLabelPriority("tag", { importanceRank: 0 })
    );
  });
});
