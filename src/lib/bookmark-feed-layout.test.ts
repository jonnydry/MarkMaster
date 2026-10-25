import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  bookmarkFeedColumnClassName,
  galleryPosterGridClassName,
  getBookmarkBandClassName,
  getBookmarkListContainerClassName,
  isFullWidthBookmarkView,
} from "@/lib/bookmark-feed-layout";

describe("bookmark list layout classes", () => {
  it("keeps feed and compact in the reading column", () => {
    expect(getBookmarkListContainerClassName("feed")).toBe(bookmarkFeedColumnClassName);
    expect(getBookmarkListContainerClassName("compact")).toBe(bookmarkFeedColumnClassName);
    expect(getBookmarkListContainerClassName()).toBe(bookmarkFeedColumnClassName);
    expect(isFullWidthBookmarkView("feed")).toBe(false);
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

  it("points the gallery at the offset poster grid", () => {
    expect(galleryPosterGridClassName).toBe("gallery-poster-grid");
    const css = readFileSync(resolve("src/app/globals.css"), "utf8");
    const start = css.indexOf(".gallery-poster-grid");
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, start + 1400);
    expect(block).toContain("nth-child(odd)");
    expect(block).toContain("margin-right: 12%");
    expect(block).toContain("margin-left: 12%");
    expect(block).toContain("margin-top: 2.75rem");
    expect(block).toContain("nth-child(3n + 2)");
    expect(block).toContain("margin-top: 4rem");
  });
});
