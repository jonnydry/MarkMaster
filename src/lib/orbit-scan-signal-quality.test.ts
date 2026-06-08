import { describe, expect, it } from "vitest";

import { computeOrbitScanSignalQuality } from "./orbit-scan-signal-quality";

describe("computeOrbitScanSignalQuality", () => {
  it("counts rich and sparse bookmarks from dataQuality flags", () => {
    const quality = computeOrbitScanSignalQuality({
      bookmarks: [
        {
          id: "rich",
          tweetId: "tweet-1",
          authorUsername: "researcher",
          authorDisplayName: "Researcher",
          authorVerified: true,
          tweetText: "Sparse",
          tweetCreatedAt: new Date("2026-05-01T00:00:00.000Z"),
          bookmarkedAt: new Date("2026-05-02T00:00:00.000Z"),
          publicMetrics: null,
          media: null,
          urls: [
            {
              expanded_url: "https://arxiv.org/abs/1",
              display_url: "arxiv.org/abs/1",
              title: "AI benchmark paper",
            },
          ],
          quotedTweet: null,
          notes: [],
          xMetadata: {
            tweet: {
              note_tweet: {
                text: "Full note tweet about AI benchmark evaluation systems.",
              },
            },
          },
        },
        {
          id: "sparse",
          tweetId: "tweet-2",
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
        },
      ],
      existingTags: [],
      existingCollections: [],
    });

    expect(quality).toEqual({ richCount: 1, sparseCount: 1 });
  });

  it("counts substantive tweetText as rich without note_tweet metadata", () => {
    const quality = computeOrbitScanSignalQuality({
      bookmarks: [
        {
          id: "rich",
          tweetId: "tweet-1",
          authorUsername: "researcher",
          authorDisplayName: "Researcher",
          authorVerified: true,
          tweetText: "Clear AI benchmark paper with enough topical signal.",
          tweetCreatedAt: new Date("2026-05-01T00:00:00.000Z"),
          bookmarkedAt: new Date("2026-05-02T00:00:00.000Z"),
          publicMetrics: null,
          media: null,
          urls: null,
          quotedTweet: null,
          notes: [],
        },
      ],
      existingTags: [],
      existingCollections: [],
    });

    expect(quality).toEqual({ richCount: 1, sparseCount: 0 });
  });
});