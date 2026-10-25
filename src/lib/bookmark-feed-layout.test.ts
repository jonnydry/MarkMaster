import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  bookmarkFeedColumnClassName,
  galleryPosterGridClassName,
  getBookmarkBandClassName,
  getBookmarkListContainerClassName,
  isFullWidthBookmarkView,
  showsDashboardStatsRail,
} from "@/lib/bookmark-feed-layout";

describe("bookmark list layout classes", () => {
  it("keeps feed and compact in the reading column", () => {
    expect(getBookmarkListContainerClassName("feed")).toBe(bookmarkFeedColumnClassName);
    expect(getBookmarkListContainerClassName("compact")).toBe(bookmarkFeedColumnClassName);
    expect(getBookmarkListContainerClassName()).toBe(bookmarkFeedColumnClassName);
    expect(isFullWidthBookmarkView("feed")).toBe(false);
  });

  it("keeps the stats rail on feed and compact only", () => {
    expect(showsDashboardStatsRail("feed")).toBe(true);
    expect(showsDashboardStatsRail("compact")).toBe(true);
    expect(showsDashboardStatsRail("grid")).toBe(false);
    expect(showsDashboardStatsRail("gallery")).toBe(false);
  });

  it("gives grid and gallery the full content width", () => {
    expect(getBookmarkListContainerClassName("grid")).toBe("");
    expect(getBookmarkListContainerClassName("gallery")).toBe("");
    expect(isFullWidthBookmarkView("gallery")).toBe(true);
    expect(isFullWidthBookmarkView("grid")).toBe(true);
  });

  it("aligns gallery bands with the poster inset", () => {
    expect(getBookmarkBandClassName("gallery")).toBe("w-full px-3");
    expect(getBookmarkBandClassName("feed")).toBe(bookmarkFeedColumnClassName);
    expect(getBookmarkBandClassName("compact")).toBe(bookmarkFeedColumnClassName);
  });

  it("packs the gallery without column drops", () => {
    expect(galleryPosterGridClassName).toBe("gallery-poster-grid");
    const css = readFileSync(resolve("src/app/globals.css"), "utf8");
    const start = css.indexOf(".gallery-poster-grid");
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, start + 1200);
    expect(block).toContain("gap: 0.5rem");
    expect(block).toContain("scroll-margin-top");
    expect(block).toContain("min-width: 22rem");
    expect(block).toContain("repeat(2, minmax(0, 1fr))");
    expect(block).toContain("min-width: 48rem");
    expect(block).toContain("repeat(3, minmax(0, 1fr))");
    expect(block).not.toContain("min-width: 36rem");
    expect(block).not.toContain("min-width: 68rem");
    const offsets = block.replaceAll("scroll-margin-top", "").replaceAll("scroll-margin-bottom", "");
    expect(offsets).not.toContain("margin-top");
    expect(offsets).not.toContain("margin-left");
    expect(offsets).not.toContain("margin-right");
    expect(block).not.toContain("nth-child");
    expect(block).not.toContain("scroll-snap");
  });
});
