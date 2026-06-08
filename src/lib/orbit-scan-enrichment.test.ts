import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/x-api", () => ({
  RateLimitError: class RateLimitError extends Error {
    rateLimit = { remaining: 0, limit: 0, resetAt: new Date() };
  },
  refreshBookmarkDataByTweetIds: refreshMock,
}));

vi.mock("@/lib/sync-utils", () => ({
  buildBookmarkUpdateData: vi.fn((data) => ({
    authorUsername: data.author.username,
    authorDisplayName: data.author.name,
    authorVerified: data.author.verified ?? false,
    tweetText: data.tweet.text,
    publicMetrics: data.tweet.public_metrics ?? null,
    media: data.media,
    urls: data.tweet.entities?.urls ?? null,
    quotedTweet: null,
    xMetadata: {
      tweet: {
        note_tweet: data.tweet.note_tweet,
        context_annotations: data.tweet.context_annotations,
      },
      author: { description: data.author.description },
    },
    tweetCreatedAt: new Date(data.tweet.created_at),
    syncedAt: new Date(),
  })),
  updateBookmarksInBatches: updateMock,
}));

import { enrichBookmarksForScan, needsEnrichment } from "./orbit-scan-enrichment";

const baseBookmark = {
  id: "bookmark-1",
  tweetId: "tweet-1",
  tweetText: "👀",
  authorUsername: "researcher",
  authorDisplayName: "Researcher",
  authorVerified: false,
  publicMetrics: null,
  media: null,
  urls: null,
  quotedTweet: null,
  xMetadata: null,
  tweetCreatedAt: new Date("2026-05-01T00:00:00.000Z"),
  bookmarkedAt: new Date("2026-05-02T00:00:00.000Z"),
  syncedAt: new Date("2026-05-02T00:00:00.000Z"),
  notes: [],
};

describe("orbit scan enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue(1);
  });

  it("flags sparse bookmarks and truncated tweets without note_tweet", () => {
    expect(needsEnrichment(baseBookmark)).toBe(true);
    expect(
      needsEnrichment({
        ...baseBookmark,
        tweetText: `${"x".repeat(280)}…`,
        xMetadata: { tweet: {} },
      })
    ).toBe(true);
    expect(
      needsEnrichment({
        ...baseBookmark,
        tweetText: "Clear AI benchmark paper with enough topical signal.",
        urls: [
          {
            expanded_url: "https://arxiv.org/abs/1",
            title: "AI benchmark paper",
          },
        ],
        syncedAt: new Date(),
        xMetadata: {
          tweet: {
            context_annotations: [
              { entity: { name: "Artificial Intelligence" } },
            ],
          },
        },
      })
    ).toBe(false);
  });

  it("refreshes bookmarks that need enrichment", async () => {
    refreshMock.mockResolvedValue({
      bookmarks: [
        {
          tweet: {
            id: "tweet-1",
            text: "Full note tweet about AI benchmark evaluation systems.",
            created_at: "2026-05-01T00:00:00.000Z",
            author_id: "author-1",
            note_tweet: {
              text: "Full note tweet about AI benchmark evaluation systems.",
            },
            context_annotations: [
              { entity: { name: "Artificial Intelligence" } },
            ],
          },
          author: {
            id: "author-1",
            name: "Researcher",
            username: "researcher",
            description: "AI researcher",
          },
          media: [],
        },
      ],
      rateLimit: { remaining: 1, limit: 180, resetAt: new Date() },
    });

    const result = await enrichBookmarksForScan("user-1", [baseBookmark]);

    expect(refreshMock).toHaveBeenCalledWith("user-1", ["tweet-1"]);
    expect(updateMock).toHaveBeenCalled();
    expect(result.enrichment).toMatchObject({
      attempted: 1,
      refreshed: 1,
      skipped: 0,
    });
    expect(result.bookmarks[0]?.tweetText).toContain("Full note tweet");
  });

  it("skips enrichment on rate limit without blocking scan bookmarks", async () => {
    const { RateLimitError } = await import("@/lib/x-api");
    refreshMock.mockRejectedValue(new RateLimitError({ remaining: 0, limit: 0, resetAt: new Date() }));

    const result = await enrichBookmarksForScan("user-1", [baseBookmark]);

    expect(result.bookmarks).toEqual([baseBookmark]);
    expect(result.enrichment).toMatchObject({
      attempted: 1,
      refreshed: 0,
      skipped: 0,
      failed: 1,
      reason: "rate_limited",
    });
  });

  it("maps generic failures to reason error with failed count", async () => {
    refreshMock.mockRejectedValue(new Error("X API upstream timeout"));

    const result = await enrichBookmarksForScan("user-1", [baseBookmark]);

    expect(result.enrichment).toMatchObject({
      attempted: 1,
      refreshed: 0,
      skipped: 0,
      failed: 1,
      reason: "error",
    });
  });

  it("maps auth failures and preserves skipped counts", async () => {
    refreshMock.mockRejectedValue(new Error("X API 401 Unauthorized"));

    const freshBookmark = {
      ...baseBookmark,
      id: "bookmark-2",
      tweetId: "tweet-2",
      tweetText: "Clear AI benchmark paper with enough topical signal.",
      urls: [
        {
          expanded_url: "https://arxiv.org/abs/1",
          title: "AI benchmark paper",
        },
      ],
      syncedAt: new Date(),
      xMetadata: {
        tweet: {
          context_annotations: [
            { entity: { name: "Artificial Intelligence" } },
          ],
        },
      },
    };

    const result = await enrichBookmarksForScan("user-1", [baseBookmark, freshBookmark]);

    expect(result.bookmarks).toEqual([baseBookmark, freshBookmark]);
    expect(result.enrichment).toMatchObject({
      attempted: 1,
      refreshed: 0,
      skipped: 1,
      failed: 1,
      reason: "auth_error",
    });
  });

  it("flags stale syncs missing metadata for enrichment", () => {
    const staleDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    expect(
      needsEnrichment({
        ...baseBookmark,
        tweetText: "Clear AI benchmark paper with enough topical signal.",
        urls: [
          {
            expanded_url: "https://arxiv.org/abs/1",
            title: "AI benchmark paper",
          },
        ],
        syncedAt: staleDate,
        xMetadata: null,
      })
    ).toBe(true);
  });

  it("preserves notes and folder hints when merging refreshed bookmarks", async () => {
    refreshMock.mockResolvedValue({
      bookmarks: [
        {
          tweet: {
            id: "tweet-1",
            text: "Refreshed tweet text with richer metadata.",
            created_at: "2026-05-01T00:00:00.000Z",
            author_id: "author-1",
          },
          author: {
            id: "author-1",
            name: "Researcher",
            username: "researcher",
          },
          media: [],
        },
      ],
      rateLimit: { remaining: 1, limit: 180, resetAt: new Date() },
    });

    const result = await enrichBookmarksForScan("user-1", [
      {
        ...baseBookmark,
        notes: [{ id: "note-1", content: "Keep this note" }],
        xFolderHints: [{ id: "folder-1", name: "AI Papers" }],
      },
    ]);

    expect(result.bookmarks[0]).toMatchObject({
      tweetText: "Refreshed tweet text with richer metadata.",
      notes: [{ id: "note-1", content: "Keep this note" }],
      xFolderHints: [{ id: "folder-1", name: "AI Papers" }],
    });
  });

  it("handles partial refresh in mixed batches", async () => {
    const freshBookmark = {
      ...baseBookmark,
      id: "bookmark-2",
      tweetId: "tweet-2",
      tweetText: "Clear AI benchmark paper with enough topical signal.",
      urls: [
        {
          expanded_url: "https://arxiv.org/abs/1",
          title: "AI benchmark paper",
        },
      ],
      syncedAt: new Date(),
      xMetadata: {
        tweet: {
          context_annotations: [
            { entity: { name: "Artificial Intelligence" } },
          ],
        },
      },
    };

    refreshMock.mockResolvedValue({
      bookmarks: [
        {
          tweet: {
            id: "tweet-1",
            text: "Refreshed sparse bookmark text with more context.",
            created_at: "2026-05-01T00:00:00.000Z",
            author_id: "author-1",
          },
          author: {
            id: "author-1",
            name: "Researcher",
            username: "researcher",
          },
          media: [],
        },
      ],
      rateLimit: { remaining: 1, limit: 180, resetAt: new Date() },
    });
    updateMock.mockResolvedValue(1);

    const result = await enrichBookmarksForScan("user-1", [baseBookmark, freshBookmark]);

    expect(result.enrichment).toMatchObject({
      attempted: 1,
      refreshed: 1,
      skipped: 1,
    });
    expect(result.bookmarks[0]?.tweetText).toContain("Refreshed sparse bookmark");
    expect(result.bookmarks[1]).toEqual(freshBookmark);
  });
});