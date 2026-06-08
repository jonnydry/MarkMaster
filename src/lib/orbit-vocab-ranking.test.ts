import { describe, expect, it } from "vitest";

import {
  rankCollectionsForOrbitPrompt,
  rankTagsForOrbitPrompt,
} from "./orbit-vocab-ranking";

const bookmark = {
  id: "b1",
  tweetId: "tweet-1",
  authorUsername: "researcher",
  authorDisplayName: "Researcher",
  authorVerified: true,
  tweetText: "New arxiv paper on AI benchmark evaluation.",
  tweetCreatedAt: new Date("2026-05-01T00:00:00.000Z"),
  bookmarkedAt: new Date("2026-05-02T00:00:00.000Z"),
  publicMetrics: null,
  media: null,
  urls: [
    {
      expanded_url: "https://arxiv.org/abs/2501.00001",
      display_url: "arxiv.org/abs/2501.00001",
      title: "AI benchmark paper",
    },
  ],
  quotedTweet: null,
  notes: [],
};

describe("orbit vocab ranking", () => {
  it("ranks batch-relevant tags above unrelated high-count tags", () => {
    const ranked = rankTagsForOrbitPrompt(
      [
        { name: "Gardening", color: "#22c55e", bookmarkCount: 100 },
        { name: "AI", color: "#1d9bf0", bookmarkCount: 5 },
        { name: "Paper", color: "#a855f7", bookmarkCount: 2 },
      ],
      [bookmark],
      [
        {
          authorUsername: "researcher",
          priorCount: 4,
          tags: ["AI"],
          collections: [],
        },
      ]
    );

    expect(ranked.map((tag) => tag.name).slice(0, 2)).toEqual(["AI", "Paper"]);
  });

  it("ranks batch-relevant collections by overlap and author priors", () => {
    const ranked = rankCollectionsForOrbitPrompt(
      [
        { name: "Garden Ideas", description: null, bookmarkCount: 20 },
        { name: "AI Papers", description: "Research papers", bookmarkCount: 4 },
      ],
      [bookmark],
      [
        {
          authorUsername: "researcher",
          priorCount: 4,
          tags: [],
          collections: ["AI Papers"],
        },
      ]
    );

    expect(ranked[0]?.name).toBe("AI Papers");
  });

  it("ranks batch-relevant low-count tags using note_tweet primary text", () => {
    const ranked = rankTagsForOrbitPrompt(
      [
        { name: "Gardening", color: "#22c55e", bookmarkCount: 100 },
        { name: "Benchmark", color: "#f59e0b", bookmarkCount: 1 },
      ],
      [
        {
          ...bookmark,
          tweetText: "👀",
          xMetadata: {
            tweet: {
              note_tweet: {
                text: "Detailed benchmark evaluation systems for transformer models.",
              },
            },
          },
        },
      ]
    );

    expect(ranked[0]?.name).toBe("Benchmark");
  });
});