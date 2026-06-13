import { describe, expect, it, vi, beforeEach } from "vitest";
import type { BookmarkData } from "./x-api";

const mocks = vi.hoisted(() => ({
  fetchBookmarks: vi.fn(),
  resolveXFoldersForSync: vi.fn(),
  fetchBookmarksByFolder: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    hiddenBookmark: { findMany: vi.fn() },
    bookmark: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
    collection: { upsert: vi.fn() },
    collectionItem: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("./prisma", () => ({ prisma: mocks.prisma }));

vi.mock("./x-api", () => {
  class RateLimitError extends Error {
    rateLimit: { resetAt: Date };

    constructor(rateLimit: { resetAt: Date }) {
      super("Rate limit exceeded");
      this.name = "RateLimitError";
      this.rateLimit = rateLimit;
    }
  }

  return {
    fetchBookmarks: mocks.fetchBookmarks,
    fetchBookmarksByFolder: mocks.fetchBookmarksByFolder,
    RateLimitError,
  };
});

vi.mock("./sync-folder-metadata", () => ({
  resolveXFoldersForSync: mocks.resolveXFoldersForSync,
  X_FOLDER_COLLECTION_SOURCE: "x-bookmark-folder",
}));

import { syncBookmarks } from "./sync";

function makeBookmarkData(id: string): BookmarkData {
  return {
    tweet: {
      id,
      text: `Bookmark ${id}`,
      created_at: "2026-05-08T00:00:00.000Z",
      author_id: `author-${id}`,
      public_metrics: {
        retweet_count: 0,
        reply_count: 0,
        like_count: 0,
        quote_count: 0,
        bookmark_count: 0,
        impression_count: 0,
      },
    },
    author: {
      id: `author-${id}`,
      name: `Author ${id}`,
      username: `author_${id}`,
    },
    media: [],
  };
}

describe("syncBookmarks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findUnique.mockResolvedValue({ xId: "x-user-1" });
    mocks.prisma.user.update.mockResolvedValue({});
    mocks.prisma.hiddenBookmark.findMany.mockResolvedValue([]);
    mocks.prisma.bookmark.createMany.mockResolvedValue({ count: 0 });
    mocks.prisma.collectionItem.upsert.mockResolvedValue({});
    mocks.prisma.collectionItem.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.collection.upsert.mockResolvedValue({ id: "collection-1" });
    mocks.prisma.collectionItem.findMany.mockResolvedValue([]);
    mocks.resolveXFoldersForSync.mockResolvedValue({ folders: [], fromCache: false });
    mocks.fetchBookmarksByFolder.mockResolvedValue({ bookmarks: [] });
  });

  it("updates existing bookmarks in bounded batches", async () => {
    const bookmarks = Array.from({ length: 25 }, (_, index) =>
      makeBookmarkData(`tweet-${index}`)
    );
    mocks.prisma.bookmark.findMany.mockResolvedValue(
      bookmarks.map((bookmark) => ({ tweetId: bookmark.tweet.id }))
    );
    mocks.fetchBookmarks.mockResolvedValue({ bookmarks, nextToken: undefined });

    let activeUpdates = 0;
    let maxActiveUpdates = 0;
    mocks.prisma.bookmark.updateMany.mockImplementation(async () => {
      activeUpdates += 1;
      maxActiveUpdates = Math.max(maxActiveUpdates, activeUpdates);
      await new Promise((resolve) => setTimeout(resolve, 1));
      activeUpdates -= 1;
      return { count: 1 };
    });

    const result = await syncBookmarks("user-1");

    expect(result.updatedBookmarks).toBe(25);
    expect(result.totalFetched).toBe(25);
    expect(result.hitExisting).toBe(true);
    expect(mocks.prisma.bookmark.updateMany).toHaveBeenCalledTimes(25);
    expect(maxActiveUpdates).toBeLessThanOrEqual(10);
  });

  it("stops after one page when every bookmark already exists", async () => {
    const bookmarks = Array.from({ length: 10 }, (_, index) =>
      makeBookmarkData(`tweet-${index}`)
    );
    mocks.prisma.bookmark.findMany.mockResolvedValue(
      bookmarks.map((bookmark) => ({ tweetId: bookmark.tweet.id }))
    );
    mocks.fetchBookmarks.mockResolvedValueOnce({
      bookmarks,
      nextToken: "older-page",
    });

    const result = await syncBookmarks("user-1");

    expect(mocks.fetchBookmarks).toHaveBeenCalledTimes(1);
    expect(result.newBookmarks).toBe(0);
    expect(result.hitExisting).toBe(true);
    expect(result.updatedBookmarks).toBe(10);
  });
});

describe("refactored sync path (smoke test)", () => {
  it("exercises syncBookmarks without crashing", async () => {
    const { syncBookmarks } = await import("./sync");

    const result = await syncBookmarks("user-1");

    expect(result).toHaveProperty("newBookmarks");
    expect(result).toHaveProperty("updatedBookmarks");
    expect(result).toHaveProperty("totalFetched");
    expect(typeof result.newBookmarks).toBe("number");
  });
});
