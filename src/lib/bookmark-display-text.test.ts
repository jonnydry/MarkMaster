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

  it("uses the stored title for the matching t.co link", () => {
    expect(
      formatBookmarkDisplayText({
        tweetText: "https://t.co/abc",
        authorUsername: "note",
        urls: [
          {
            url: "https://t.co/other",
            title: "Wrong card",
            expanded_url: "https://example.com/wrong",
          },
          {
            url: "https://t.co/abc",
            title: "Scaling laws",
            expanded_url: "https://arxiv.org/abs/1",
          },
        ],
      })
    ).toBe("Scaling laws");
  });

  it("falls back to display_url then hostname when the match has no title", () => {
    expect(
      formatBookmarkDisplayText({
        tweetText: "https://t.co/abc",
        urls: [{ url: "https://t.co/abc", display_url: "arxiv.org/abs/1" }],
      })
    ).toBe("arxiv.org/abs/1");

    expect(
      formatBookmarkDisplayText({
        tweetText: "https://t.co/abc",
        urls: [
          {
            url: "https://t.co/abc",
            expanded_url: "https://www.example.com/post",
          },
        ],
      })
    ).toBe("example.com");
  });

  it("ignores stored titles that do not match a t.co in the body", () => {
    expect(
      formatBookmarkDisplayText({
        tweetText: "https://t.co/abc",
        authorUsername: "note",
        urls: [{ url: "https://t.co/zzz", title: "Unrelated" }],
      })
    ).toBe("Post by @note");
  });

  it("leaves mixed captions unchanged even when a url has a title", () => {
    expect(
      formatBookmarkDisplayText({
        tweetText: "London in the 1930s https://t.co/3NQFJ4ekoI",
        urls: [{ url: "https://t.co/3NQFJ4ekoI", title: "Archive film" }],
      })
    ).toBe("London in the 1930s https://t.co/3NQFJ4ekoI");
  });

  it("keeps the photo fallback when the stored link is only a pic.x.com short link", () => {
    expect(
      formatBookmarkDisplayText({
        tweetText: "https://t.co/QkmtN6Euad",
        authorUsername: "m_tomorrowland",
        media: [{ type: "photo" }],
        urls: [
          {
            url: "https://t.co/QkmtN6Euad",
            display_url: "pic.x.com/QkmtN6Euad",
            expanded_url: "https://x.com/m_tomorrowland/status/1/photo/1",
          },
        ],
      })
    ).toBe("Photo by @m_tomorrowland");
  });
});
