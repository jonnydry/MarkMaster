import { describe, expect, it } from "vitest";

import {
  collectOrbitBookmarkHaystackTexts,
  getOrbitArticlePreviewText,
  getOrbitBookmarkPrimaryText,
  getOrbitNoteTweetText,
  textHasUsefulSignal,
} from "./orbit-primary-text";

describe("orbit-primary-text", () => {
  it("prefers note_tweet text over stored tweetText", () => {
    const bookmark = {
      tweetText: "Short tweet",
      xMetadata: {
        tweet: {
          note_tweet: {
            text: "Full note tweet about AI benchmark evaluation systems.",
          },
        },
      },
    };

    expect(getOrbitNoteTweetText(bookmark.xMetadata)).toBe(
      "Full note tweet about AI benchmark evaluation systems."
    );
    expect(getOrbitBookmarkPrimaryText(bookmark)).toBe(
      "Full note tweet about AI benchmark evaluation systems."
    );
  });

  it("falls back to tweetText when note_tweet is absent", () => {
    expect(
      getOrbitBookmarkPrimaryText({
        tweetText: "Regular tweet body",
        xMetadata: null,
      })
    ).toBe("Regular tweet body");
  });

  it("detects useful topical signal in substantive text", () => {
    expect(textHasUsefulSignal("Clear AI benchmark paper with enough signal.")).toBe(
      true
    );
    expect(textHasUsefulSignal("👀")).toBe(false);
  });

  it("collects supplemental haystack fields aligned with signal extraction", () => {
    expect(
      collectOrbitBookmarkHaystackTexts({
        tweetText: "Short tweet",
        quotedTweet: { text: "Quoted context about Rust async runtimes" },
        notes: [{ content: "Follow up on Tokio patterns" }],
        xMetadata: {
          tweet: {
            article: {
              title: "Benchmark article",
              preview_text: "Preview body for the article.",
            },
          },
          author: { description: "Systems researcher" },
        },
      })
    ).toEqual(
      expect.arrayContaining([
        "Short tweet",
        "Quoted context about Rust async runtimes",
        "Follow up on Tokio patterns",
        "Benchmark article",
        "Preview body for the article.",
        "Systems researcher",
      ])
    );
  });

  it("reads article preview text from metadata", () => {
    expect(
      getOrbitArticlePreviewText({
        tweet: {
          article: {
            preview_text: "Article preview body",
          },
        },
      })
    ).toBe("Article preview body");
  });
});