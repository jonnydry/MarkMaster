import { describe, expect, it } from "vitest";

import {
  formatBookmarkDisplayText,
  isTcoOnlyTweetText,
} from "@/lib/bookmark-display-text";

describe("isTcoOnlyTweetText", () => {
  it("treats empty and whitespace as empty", () => {
    expect(isTcoOnlyTweetText("")).toBe(true);
    expect(isTcoOnlyTweetText("   ")).toBe(true);
  });

  it("treats one or more t.co links as title-less", () => {
    expect(isTcoOnlyTweetText("https://t.co/yQQGvDMFES")).toBe(true);
    expect(isTcoOnlyTweetText("https://t.co/abc https://t.co/def")).toBe(true);
  });

  it("keeps captions that include a t.co link", () => {
    expect(
      isTcoOnlyTweetText("London in the 1930s https://t.co/3NQFJ4ekoI")
    ).toBe(false);
  });
});

describe("formatBookmarkDisplayText", () => {
  it("returns the original caption when there is real text", () => {
    expect(
      formatBookmarkDisplayText({
        tweetText: "London in the 1930s https://t.co/3NQFJ4ekoI",
        authorUsername: "JamesLucasIT",
      })
    ).toBe("London in the 1930s https://t.co/3NQFJ4ekoI");
  });

  it("falls back to video/photo/post by author for t.co-only bodies", () => {
    expect(
      formatBookmarkDisplayText({
        tweetText: "https://t.co/yQQGvDMFES",
        authorUsername: "captive_dreamer",
        media: [{ type: "video" }],
      })
    ).toBe("Video by @captive_dreamer");

    expect(
      formatBookmarkDisplayText({
        tweetText: "",
        authorUsername: "@lens",
        media: [{ type: "photo" }],
      })
    ).toBe("Photo by @lens");

    expect(
      formatBookmarkDisplayText({
        tweetText: "https://t.co/abc",
        authorUsername: "note",
      })
    ).toBe("Post by @note");
  });
});
