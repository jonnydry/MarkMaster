import { describe, expect, it } from "vitest";

import { mapOrbitScannedBookmarksForClient } from "@/lib/orbit-scan-bookmarks";

describe("mapOrbitScannedBookmarksForClient", () => {
  it("maps scan rows into review overlay bookmarks", () => {
    const mapped = mapOrbitScannedBookmarksForClient([
      {
        id: "b1",
        tweetId: "t1",
        authorId: "a1",
        authorUsername: "dev",
        authorDisplayName: "Dev",
        authorProfileImage: null,
        authorVerified: true,
        tweetText: "Hello world",
        publicMetrics: {
          retweet_count: 1,
          reply_count: 2,
          like_count: 3,
          quote_count: 0,
          bookmark_count: 4,
        },
        media: null,
        urls: null,
        quotedTweet: null,
        tweetCreatedAt: new Date("2026-05-01T00:00:00.000Z"),
        bookmarkedAt: new Date("2026-05-02T00:00:00.000Z"),
        notes: [{ id: "n1", content: "note" }],
        xFolderHints: [{ id: "folder-1", name: "Articles" }],
      },
    ]);

    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.id).toBe("b1");
    expect(mapped[0]?.tweetCreatedAt).toBe("2026-05-01T00:00:00.000Z");
    expect(mapped[0]?.collectionItems).toEqual([
      { collection: { id: "folder-1", name: "Articles" } },
    ]);
    expect(mapped[0]?.tags).toEqual([]);
  });
});
