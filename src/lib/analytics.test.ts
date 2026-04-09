import { describe, expect, it } from "vitest";
import { buildMediaBreakdown } from "@/lib/analytics";

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
