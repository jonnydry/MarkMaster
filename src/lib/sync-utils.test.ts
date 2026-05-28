import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BookmarkData } from "./x-api";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  prisma: {
    bookmark: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
    },
    hiddenBookmark: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("./prisma", () => ({ prisma: mocks.prisma }));

import {
  buildBookmarkCreateData,
  buildBookmarkUpdateData,
  getExistingTweetIdsForUserAndTweets,
  getHiddenTweetIdsForUserAndTweets,
  updateBookmarksInBatches,
} from "./sync-utils";

function makeBookmarkData(id: string): BookmarkData {
  return {
    tweet: {
      id,
      text: `Tweet text ${id}`,
      created_at: "2024-01-01T00:00:00Z",
      author_id: `author-${id}`,
      public_metrics: { like_count: 10, retweet_count: 2, reply_count: 1 },
      entities: { urls: [{ url: "https://example.com" }] },
      attachments: undefined,
      referenced_tweets: undefined,
    },
    author: {
      id: `author-${id}`,
      name: `Author ${id}`,
      username: `author${id}`,
      profile_image_url: "https://example.com/avatar.jpg",
      verified: true,
    },
    media: [
      {
        media_key: "m1",
        type: "photo",
        url: "https://example.com/photo.jpg",
        preview_image_url: "https://example.com/preview.jpg",
        width: 1200,
        height: 630,
      },
    ],
    quotedTweet: undefined,
  };
}

describe("sync-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildBookmarkCreateData", () => {
    it("produces the correct payload shape for a new bookmark", () => {
      const data = makeBookmarkData("tweet-123");
      const result = buildBookmarkCreateData("user-1", data);

      expect(result).toEqual({
        userId: "user-1",
        tweetId: "tweet-123",
        authorId: "author-tweet-123",
        authorUsername: "authortweet-123",
        authorDisplayName: "Author tweet-123",
        authorProfileImage: "https://example.com/avatar.jpg",
        authorVerified: true,
        tweetText: "Tweet text tweet-123",
        publicMetrics: { like_count: 10, retweet_count: 2, reply_count: 1 },
        media: [
          {
            type: "photo",
            url: "https://example.com/photo.jpg",
            preview_image_url: "https://example.com/preview.jpg",
            width: 1200,
            height: 630,
          },
        ],
        urls: [{ url: "https://example.com" }],
        quotedTweet: Prisma.JsonNull,
        tweetCreatedAt: new Date("2024-01-01T00:00:00Z"),
        syncedAt: expect.any(Date),
      });
    });

    it("uses JsonNull for missing media, urls, publicMetrics, and quotedTweet", () => {
      const minimalData: BookmarkData = {
        tweet: {
          id: "t1",
          text: "text",
          created_at: "2024-01-01T00:00:00Z",
          author_id: "a1",
          public_metrics: undefined,
          entities: undefined,
          attachments: undefined,
          referenced_tweets: undefined,
        },
        author: { id: "a1", name: "A", username: "a", verified: false },
        media: [],
        quotedTweet: undefined,
      };

      const result = buildBookmarkCreateData("user-1", minimalData);

      expect(result.publicMetrics).toBe(Prisma.JsonNull);
      expect(result.media).toBe(Prisma.JsonNull);
      expect(result.urls).toBe(Prisma.JsonNull);
      expect(result.quotedTweet).toBe(Prisma.JsonNull);
    });
  });

  describe("buildBookmarkUpdateData", () => {
    it("produces the correct update payload", () => {
      const data = makeBookmarkData("t-update");
      const result = buildBookmarkUpdateData(data);

      expect(result.tweetId).toBe("t-update");
      expect(result.publicMetrics).toEqual({ like_count: 10, retweet_count: 2, reply_count: 1 });
      expect(result.media).toHaveLength(1);
    });

    it("persists playback_url from video variants", () => {
      const data: BookmarkData = {
        ...makeBookmarkData("video-1"),
        media: [
          {
            media_key: "v1",
            type: "video",
            preview_image_url: "https://pbs.twimg.com/poster.jpg",
            width: 1280,
            height: 720,
            duration_ms: 30000,
            variants: [
              {
                bit_rate: 256000,
                content_type: "video/mp4",
                url: "https://video.twimg.com/low.mp4",
              },
              {
                bit_rate: 2176000,
                content_type: "video/mp4",
                url: "https://video.twimg.com/high.mp4",
              },
            ],
          },
        ],
      };

      const result = buildBookmarkUpdateData(data);
      expect(result.media).toEqual([
        {
          type: "video",
          url: "https://pbs.twimg.com/poster.jpg",
          preview_image_url: "https://pbs.twimg.com/poster.jpg",
          width: 1280,
          height: 720,
          playback_url: "https://video.twimg.com/high.mp4",
          duration_ms: 30000,
        },
      ]);
    });
  });

  describe("getExistingTweetIdsForUserAndTweets", () => {
    it("returns empty Set for empty input", async () => {
      const result = await getExistingTweetIdsForUserAndTweets("user-1", []);
      expect(result).toEqual(new Set());
      expect(mocks.prisma.bookmark.findMany).not.toHaveBeenCalled();
    });

    it("returns the correct set of existing tweetIds", async () => {
      mocks.prisma.bookmark.findMany.mockResolvedValue([
        { tweetId: "t1" },
        { tweetId: "t3" },
      ]);

      const result = await getExistingTweetIdsForUserAndTweets("user-1", ["t1", "t2", "t3"]);

      expect(mocks.prisma.bookmark.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1", tweetId: { in: ["t1", "t2", "t3"] } },
        select: { tweetId: true },
      });
      expect(result).toEqual(new Set(["t1", "t3"]));
    });
  });

  describe("getHiddenTweetIdsForUserAndTweets", () => {
    it("returns empty Set for empty input", async () => {
      const result = await getHiddenTweetIdsForUserAndTweets("user-1", []);
      expect(result).toEqual(new Set());
    });

    it("returns hidden tweetIds", async () => {
      mocks.prisma.hiddenBookmark.findMany.mockResolvedValue([{ tweetId: "hidden-1" }]);

      const result = await getHiddenTweetIdsForUserAndTweets("user-1", ["hidden-1", "visible"]);

      expect(result).toEqual(new Set(["hidden-1"]));
    });
  });

  describe("updateBookmarksInBatches", () => {
    it("processes updates in batches of BOOKMARK_UPDATE_BATCH_SIZE", async () => {
      mocks.prisma.bookmark.updateMany.mockResolvedValue({ count: 1 });

      const entries: Array<{ tweetId: string; data: BookmarkData }> = Array.from(
        { length: 25 },
        (_, i) => ({
          tweetId: `t${i}`,
          data: makeBookmarkData(`t${i}`),
        })
      );

      const updated = await updateBookmarksInBatches("user-1", entries);

      expect(updated).toBe(25);
      // updateMany is called once per bookmark (inside Promise.all per batch).
      // With batch size 10 and 25 items → 25 total calls.
      expect(mocks.prisma.bookmark.updateMany).toHaveBeenCalledTimes(25);
    });
  });
});
