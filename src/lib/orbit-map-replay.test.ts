import { describe, expect, it } from "vitest";

import {
  formatOrbitMapReplayDate,
  getOrbitMapReplayDays,
  getOrbitMapReplayMonths,
  ORBIT_MAP_REPLAY_MAX_DAYS,
} from "@/lib/orbit-map-replay";
import type { OrbitGraphNode, OrbitGraphPayload } from "@/types";

function graphWithAges(ages: Array<number | undefined>): OrbitGraphPayload {
  const nodes: OrbitGraphNode[] = ages.map((ageDays, index) => ({
    kind: "bookmark",
    id: `b${index}`,
    title: "t",
    authorUsername: "a",
    authorDisplayName: "A",
    affiliated: false,
    recent: false,
    ageDays,
  }));
  return {
    nodes,
    edges: [],
    stats: {
      totalBookmarks: nodes.length,
      affiliatedBookmarks: 0,
      looseBookmarks: nodes.length,
      renderedBookmarks: nodes.length,
      truncatedBookmarks: 0,
      tagCount: 0,
      userCollectionCount: 0,
      xFolderCount: 0,
    },
    generatedAt: "2026-09-26T00:00:00.000Z",
    nodeCap: 1000,
  };
}

describe("getOrbitMapReplayDays", () => {
  it("reaches back to the oldest drawn bookmark", () => {
    expect(getOrbitMapReplayDays(graphWithAges([3, 120.4, 45]))).toBe(121);
  });

  it("caps long histories and pads very short ones", () => {
    expect(getOrbitMapReplayDays(graphWithAges([5000]))).toBe(ORBIT_MAP_REPLAY_MAX_DAYS);
    expect(getOrbitMapReplayDays(graphWithAges([2]))).toBe(30);
  });

  it("is unavailable without save dates", () => {
    expect(getOrbitMapReplayDays(graphWithAges([undefined]))).toBeNull();
    expect(getOrbitMapReplayDays(null)).toBeNull();
  });
});

describe("replay labels", () => {
  it("rounds days to months for the menu", () => {
    expect(getOrbitMapReplayMonths(548)).toBe(18);
    expect(getOrbitMapReplayMonths(10)).toBe(1);
  });

  it("names the month being shown, and today at the end", () => {
    const now = Date.UTC(2026, 8, 26, 12);
    expect(formatOrbitMapReplayDate(0, now)).toBe("Today");
    expect(formatOrbitMapReplayDate(365, now)).toBe("Sep 2025");
  });
});
