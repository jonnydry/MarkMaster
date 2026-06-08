import { describe, expect, it } from "vitest";
import {
  buildMediaBreakdown,
  computeAnnotationPct,
  computeTriagedPct,
  computeVelocityDelta,
} from "@/lib/analytics";
import type { AnalyticsData } from "@/types";

const analyticsFixture = {
  totalBookmarks: 100,
  untaggedCount: 25,
  notedCount: 40,
  last30dCount: 12,
  previous30dCount: 8,
} as AnalyticsData;

describe("buildMediaBreakdown", () => {
  it("returns the chart rows in the expected order", () => {
    expect(
      buildMediaBreakdown({
        totalBookmarks: 12,
        mediaOnly: 4,
        mediaAndLinks: 3,
        linksOnly: 2,
        textOnly: 3,
      })
    ).toEqual([
      { type: "Media", count: 4 },
      { type: "Media + Links", count: 3 },
      { type: "Links", count: 2 },
      { type: "Text Only", count: 3 },
    ]);
  });
});

describe("computeTriagedPct", () => {
  it("returns triaged percentage capped at 100", () => {
    expect(computeTriagedPct(analyticsFixture)).toBe(75);
    expect(computeTriagedPct(null)).toBe(0);
  });
});

describe("computeVelocityDelta", () => {
  it("computes month-over-month velocity", () => {
    expect(computeVelocityDelta(analyticsFixture)).toEqual({
      pct: 50,
      abs: 4,
    });
  });

  it("handles zero prior period", () => {
    expect(
      computeVelocityDelta({
        ...analyticsFixture,
        previous30dCount: 0,
        last30dCount: 5,
      })
    ).toEqual({ pct: null, abs: 5 });
  });
});

describe("computeAnnotationPct", () => {
  it("returns noted percentage", () => {
    expect(computeAnnotationPct(analyticsFixture)).toBe(40);
  });
});
