import { describe, expect, it } from "vitest";

import {
  getOrbitScanBookmarkTokens,
  labelToTokens,
  tokenOverlapScore,
} from "./orbit-scan-tokens";

describe("orbit-scan-tokens", () => {
  it("tokenizes note_tweet primary text instead of sparse tweetText", () => {
    const tokens = getOrbitScanBookmarkTokens({
      id: "b1",
      tweetId: "tweet-1",
      authorUsername: "researcher",
      authorDisplayName: "Researcher",
      authorVerified: true,
      tweetText: "👀",
      tweetCreatedAt: new Date("2026-05-01T00:00:00.000Z"),
      bookmarkedAt: new Date("2026-05-02T00:00:00.000Z"),
      publicMetrics: null,
      media: null,
      urls: null,
      quotedTweet: null,
      notes: [],
      xMetadata: {
        tweet: {
          note_tweet: {
            text: "Detailed benchmark evaluation paper about transformer models.",
          },
        },
      },
    });

    expect(tokens.has("kw:benchmark")).toBe(true);
    expect(tokens.has("kw:evaluation")).toBe(true);
  });

  it("scores token overlap between labels and bookmark tokens", () => {
    const bookmarkTokens = getOrbitScanBookmarkTokens({
      id: "b1",
      tweetId: "tweet-1",
      authorUsername: "researcher",
      authorDisplayName: "Researcher",
      authorVerified: true,
      tweetText: "AI benchmark paper",
      tweetCreatedAt: new Date("2026-05-01T00:00:00.000Z"),
      bookmarkedAt: new Date("2026-05-02T00:00:00.000Z"),
      publicMetrics: null,
      media: null,
      urls: [
        {
          expanded_url: "https://arxiv.org/abs/1",
          display_url: "arxiv.org/abs/1",
        },
      ],
      quotedTweet: null,
      notes: [],
    });

    const labelTokens = labelToTokens("AI");
    expect(tokenOverlapScore(labelTokens, bookmarkTokens)).toBeGreaterThan(0);
  });

  it("includes quoted text and author bio in bookmark tokens", () => {
    const tokens = getOrbitScanBookmarkTokens({
      id: "b1",
      tweetId: "tweet-1",
      authorUsername: "researcher",
      authorDisplayName: "Researcher",
      authorVerified: true,
      tweetText: "Worth saving",
      tweetCreatedAt: new Date("2026-05-01T00:00:00.000Z"),
      bookmarkedAt: new Date("2026-05-02T00:00:00.000Z"),
      publicMetrics: null,
      media: null,
      urls: null,
      quotedTweet: { text: "Deep dive on Rust async runtimes" },
      notes: [],
      xMetadata: {
        author: { description: "Systems engineer building async tooling" },
      },
    });

    expect(tokens.has("kw:rust")).toBe(true);
    expect(tokens.has("kw:async")).toBe(true);
    expect(tokens.has("kw:systems")).toBe(true);
  });
});