import { describe, expect, it } from "vitest";

import { tokenizeBookmarkSearch } from "./bookmark-search";

describe("tokenizeBookmarkSearch", () => {
  it("splits and de-duplicates search terms", () => {
    expect(tokenizeBookmarkSearch("  neural  audio neural  ")).toEqual([
      "neural",
      "audio",
    ]);
  });

  it("normalizes social prefixes for author and hashtag searches", () => {
    expect(tokenizeBookmarkSearch("@measure_plan #music")).toEqual([
      "measure_plan",
      "music",
    ]);
  });

  it("caps very long searches", () => {
    expect(
      tokenizeBookmarkSearch("one two three four five six seven eight nine ten")
    ).toEqual(["one", "two", "three", "four", "five", "six", "seven", "eight"]);
  });
});
