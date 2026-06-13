import { describe, expect, it } from "vitest";

import {
  bookmarkSearchLikePattern,
  buildBookmarkSearchTermSql,
  escapeIlikePattern,
  tokenizeBookmarkSearch,
} from "./bookmark-search";

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

describe("bookmarkSearchLikePattern", () => {
  it("escapes ILIKE metacharacters in user input", () => {
    expect(escapeIlikePattern("100%")).toBe("100\\%");
    expect(bookmarkSearchLikePattern("a_b")).toBe("%a\\_b%");
  });
});

describe("buildBookmarkSearchTermSql", () => {
  it("targets indexed bookmark and note text columns", () => {
    const fragment = buildBookmarkSearchTermSql("neural");
    const sql = fragment.strings.join(" ");

    expect(sql).toContain('"tweetText" ILIKE');
    expect(sql).toContain('"authorUsername" ILIKE');
    expect(sql).toContain('"authorDisplayName" ILIKE');
    expect(sql).toContain('"Note"');
    expect(sql).toContain('"content" ILIKE');
  });
});
