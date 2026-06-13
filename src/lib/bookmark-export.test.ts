import { describe, expect, it } from "vitest";

import {
  CSV_EXPORT_HEADER,
  escapeCsvField,
  formatBookmarkCsvRow,
  sanitizeCsvField,
} from "./bookmark-export";

describe("bookmark export formatting", () => {
  const bookmark = {
    tweetId: "123",
    authorDisplayName: "Measure Plan",
    authorUsername: "measure_plan",
    tweetText: "Hello, world",
    publicMetrics: {
      like_count: 4,
      retweet_count: 1,
      reply_count: 0,
    },
    tags: [{ tag: { name: "ai" } }],
    notes: [{ content: "note" }],
    tweetCreatedAt: new Date("2026-04-30T12:00:00.000Z"),
    bookmarkedAt: new Date("2026-05-01T12:00:00.000Z"),
    tweetUrl: "https://x.com/measure_plan/status/123",
    urls: null,
  };

  it("escapes CSV fields with commas and quotes", () => {
    expect(escapeCsvField(`say "hi", friend`)).toBe(`"say ""hi"", friend"`);
  });

  it("prefixes formula-like CSV values", () => {
    expect(sanitizeCsvField("=SUM(A1)")).toBe("'=SUM(A1)");
  });

  it("formats bookmark rows", () => {
    const row = formatBookmarkCsvRow(bookmark as never);

    expect(row).toContain("123");
    expect(row).toContain("measure_plan");
    expect(row).toContain("ai");
    expect(row).toContain("note");
  });

  it("includes the CSV header constant", () => {
    expect(CSV_EXPORT_HEADER.startsWith("Tweet ID")).toBe(true);
  });
});
