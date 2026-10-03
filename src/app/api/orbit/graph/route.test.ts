import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrbitGraphPayload } from "@/types";

const { graphRouteCacheStore, cacheVersion } = vi.hoisted(() => ({
  graphRouteCacheStore: new Map<string, unknown>(),
  cacheVersion: { current: 1 as number | null },
}));

const checkRateLimitMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: checkRateLimitMock,
  };
});

vi.mock("@/lib/upstash-cache", () => {
  const lookupUserCache = vi.fn(async (_userId: string, key: string) => ({
    version: cacheVersion.current,
    value: graphRouteCacheStore.get(key) ?? null,
  }));
  return {
    readUserCacheVersion: vi.fn(async () => cacheVersion.current),
    lookupUserCache,
    getUserCachedJson: vi.fn(
      async (
        userId: string,
        key: string,
        _ttl: number,
        loader: () => Promise<unknown>,
        lookup?: ReturnType<typeof lookupUserCache>
      ) => {
        const { version, value: cached } = await (lookup ??
          lookupUserCache(userId, key));
        if (cached !== null) return { value: cached, version };
        const value = await loader();
        graphRouteCacheStore.set(key, value);
        return { value, version };
      }
    ),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tag: {
      findMany: vi.fn(),
    },
    collection: {
      findMany: vi.fn(),
    },
    bookmark: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe("/api/orbit/graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    graphRouteCacheStore.clear();
    cacheVersion.current = 1;
    checkRateLimitMock.mockResolvedValue({
      success: true,
      limit: 120,
      remaining: 119,
      reset: Date.now() + 3600000,
    });
  });

  it("treats X-folder-only bookmarks as loose while preserving folder edges", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.tag.findMany).mockResolvedValue([]);
    vi.mocked(prisma.collection.findMany).mockResolvedValue([
      {
        id: "x-folder-1",
        name: "Launch Reads",
        type: "x_folder",
        _count: { items: 1 },
      },
      {
        id: "collection-1",
        name: "Research",
        type: "user_collection",
        _count: { items: 1 },
      },
    ]);
    vi.mocked(prisma.bookmark.count)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
      {
        id: "bookmark-x-folder",
        tweetText: "Folder context still needs a real Orbit decision",
        authorUsername: "xuser",
        authorDisplayName: "X User",
        bookmarkedAt: new Date(),
        tags: [],
        collectionItems: [
          {
            collectionId: "x-folder-1",
            collection: { type: "x_folder" },
          },
        ],
      },
      {
        id: "bookmark-user-collection",
        tweetText: "Already placed in an editable collection",
        authorUsername: "reader",
        authorDisplayName: "Reader",
        bookmarkedAt: new Date(),
        tags: [],
        collectionItems: [
          {
            collectionId: "collection-1",
            collection: { type: "user_collection" },
          },
        ],
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/orbit/graph")
    );
    const payload = (await response.json()) as OrbitGraphPayload;

    expect(response.status).toBe(200);
    expect(payload.stats.looseBookmarks).toBe(1);
    expect(payload.stats.affiliatedBookmarks).toBe(1);
    expect(payload.edges).toContainEqual({
      kind: "bookmark-collection",
      bookmarkId: "bookmark-x-folder",
      collectionId: "x-folder-1",
    });
    expect(payload.edges).toContainEqual({
      kind: "loose",
      bookmarkId: "bookmark-x-folder",
    });
    expect(payload.edges).not.toContainEqual({
      kind: "loose",
      bookmarkId: "bookmark-user-collection",
    });

    const xFolderBookmark = payload.nodes.find(
      (node) => node.kind === "bookmark" && node.id === "bookmark-x-folder"
    );
    const userCollectionBookmark = payload.nodes.find(
      (node) =>
        node.kind === "bookmark" && node.id === "bookmark-user-collection"
    );

    expect(xFolderBookmark).toEqual(
      expect.objectContaining({ affiliated: false })
    );
    expect(userCollectionBookmark).toEqual(
      expect.objectContaining({ affiliated: true })
    );
    expect(prisma.bookmark.count).toHaveBeenLastCalledWith({
      where: {
        userId: "user-1",
        tags: { none: {} },
        collectionItems: {
          none: { collection: { type: "user_collection" } },
        },
      },
    });
    expect(prisma.bookmark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          collectionItems: {
            select: {
              collectionId: true,
              collection: { select: { type: true } },
            },
          },
        }),
      })
    );
  });

  it("limits bookmark nodes to the Orbit queue when scope=orbit", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.tag.findMany).mockResolvedValue([]);
    vi.mocked(prisma.collection.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bookmark.count)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(4);
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
      {
        id: "bookmark-loose",
        tweetText: "Still in orbit",
        authorUsername: "orbituser",
        authorDisplayName: "Orbit User",
        bookmarkedAt: new Date(),
        tags: [],
        collectionItems: [],
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/orbit/graph?scope=orbit")
    );
    const payload = (await response.json()) as OrbitGraphPayload;

    expect(response.status).toBe(200);
    expect(payload.scope).toBe("orbit");
    expect(prisma.bookmark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          tags: { none: {} },
          collectionItems: {
            none: { collection: { type: "user_collection" } },
          },
        },
      })
    );
    expect(payload.nodes).toContainEqual(
      expect.objectContaining({ kind: "bookmark", id: "bookmark-loose" })
    );
  });

  it("preserves expanded-spectrum tag colors in graph nodes", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.tag.findMany).mockResolvedValue([
      {
        id: "tag-generated-color",
        name: "History",
        color: "#1569cb",
        _count: { bookmarks: 3 },
      },
    ]);
    vi.mocked(prisma.collection.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bookmark.count)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost/api/orbit/graph")
    );
    const payload = (await response.json()) as OrbitGraphPayload;

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=30, stale-while-revalidate=60"
    );
    expect(response.headers.get("ETag")).toMatch(/^W\/"orbit-graph-/);
    expect(payload.nodes).toContainEqual({
      kind: "tag",
      id: "tag-generated-color",
      name: "History",
      color: "#1569cb",
      count: 3,
    });
  });

  it("merges deduplicated bookmarks for expanded anchors", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    const baseBookmark = {
      id: "bookmark-base",
      tweetText: "Already rendered",
      authorUsername: "base",
      authorDisplayName: "Base",
      bookmarkedAt: new Date(),
      tags: [{ tagId: "tag-1" }],
      collectionItems: [],
    };
    const expandedBookmark = {
      id: "bookmark-expanded",
      tweetText: "Beyond the cap, pulled in by expansion",
      authorUsername: "expanded",
      authorDisplayName: "Expanded",
      bookmarkedAt: new Date(),
      tags: [{ tagId: "tag-1" }],
      collectionItems: [],
    };

    vi.mocked(prisma.tag.findMany).mockResolvedValue([
      {
        id: "tag-1",
        name: "History",
        color: "#1569cb",
        _count: { bookmarks: 3 },
      },
    ]);
    vi.mocked(prisma.collection.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bookmark.count)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0);
    vi.mocked(prisma.bookmark.findMany)
      .mockResolvedValueOnce([baseBookmark])
      .mockResolvedValueOnce([baseBookmark, expandedBookmark]);

    const response = await GET(
      new NextRequest("http://localhost/api/orbit/graph?expand=tag-1")
    );
    const payload = (await response.json()) as OrbitGraphPayload;

    expect(response.status).toBe(200);
    expect(prisma.bookmark.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.bookmark.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { tags: { some: { tagId: { in: ["tag-1"] } } } },
          ]),
        }),
      })
    );

    const bookmarkIds = payload.nodes
      .filter((node) => node.kind === "bookmark")
      .map((node) => node.id);
    expect(bookmarkIds).toEqual(["bookmark-base", "bookmark-expanded"]);
    expect(payload.stats.renderedBookmarks).toBe(2);
  });

  it("does not treat another user's etag as fresh", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");
    const { buildOrbitGraphETag } = await import("@/lib/orbit-graph-etag");
    vi.mocked(prisma.tag.findMany).mockResolvedValue([]);
    vi.mocked(prisma.collection.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bookmark.count).mockResolvedValue(0);
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);
    const now = Date.UTC(2026, 5, 11, 12, 5);
    vi.spyOn(Date, "now").mockReturnValue(now);

    try {
      const first = await GET(new NextRequest("http://localhost/api/orbit/graph"));
      const etag = first.headers.get("ETag");
      const sameUser = buildOrbitGraphETag({
        userId: "user-1",
        cacheVersion: 1,
        scope: "library",
        nodeCap: 1000,
        expandKey: "",
        now,
      });
      const otherUser = buildOrbitGraphETag({
        userId: "user-2",
        cacheVersion: 1,
        scope: "library",
        nodeCap: 1000,
        expandKey: "",
        now,
      });

      expect(etag).toBe(sameUser);
      expect(otherUser).not.toBe(etag);

      const second = await GET(
        new NextRequest("http://localhost/api/orbit/graph", {
          headers: { "If-None-Match": otherUser },
        })
      );
      expect(second.status).toBe(200);
      expect(second.headers.get("ETag")).toBe(sameUser);
    } finally {
      vi.mocked(Date.now).mockRestore();
    }
  });

  it("returns 304 when If-None-Match matches the current etag", async () => {
    const { GET } = await import("./route");

    const first = await GET(
      new NextRequest("http://localhost/api/orbit/graph")
    );
    const etag = first.headers.get("ETag");
    expect(etag).toBeTruthy();

    const second = await GET(
      new NextRequest("http://localhost/api/orbit/graph", {
        headers: { "If-None-Match": etag! },
      })
    );

    expect(second.status).toBe(304);
    expect(second.headers.get("ETag")).toBe(etag);
  });

  it("revalidates from the cache generation without reading or rebuilding the graph", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { getUserCachedJson, lookupUserCache } = await import(
      "@/lib/upstash-cache"
    );
    const { GET } = await import("./route");
    vi.mocked(prisma.tag.findMany).mockResolvedValue([]);
    vi.mocked(prisma.collection.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bookmark.count).mockResolvedValue(0);
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);

    const first = await GET(new NextRequest("http://localhost/api/orbit/graph"));
    const etag = first.headers.get("ETag")!;
    // The cached graph expired; the library did not change.
    graphRouteCacheStore.clear();
    vi.clearAllMocks();

    const second = await GET(
      new NextRequest("http://localhost/api/orbit/graph", {
        headers: { "If-None-Match": etag },
      })
    );

    expect(second.status).toBe(304);
    expect(lookupUserCache).not.toHaveBeenCalled();
    expect(getUserCachedJson).not.toHaveBeenCalled();
    expect(prisma.bookmark.findMany).not.toHaveBeenCalled();
  });

  it("sends the new graph once the library changed", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");
    vi.mocked(prisma.tag.findMany).mockResolvedValue([]);
    vi.mocked(prisma.collection.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bookmark.count).mockResolvedValue(0);
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);

    const first = await GET(new NextRequest("http://localhost/api/orbit/graph"));
    const etag = first.headers.get("ETag")!;
    cacheVersion.current = 2;

    const second = await GET(
      new NextRequest("http://localhost/api/orbit/graph", {
        headers: { "If-None-Match": etag },
      })
    );

    expect(second.status).toBe(200);
    expect(second.headers.get("ETag")).not.toBe(etag);
  });

  it("offers no ETag and never 304s when the cache generation is unknown", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");
    vi.mocked(prisma.tag.findMany).mockResolvedValue([]);
    vi.mocked(prisma.collection.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bookmark.count).mockResolvedValue(0);
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);
    const { buildOrbitGraphETag } = await import("@/lib/orbit-graph-etag");
    cacheVersion.current = null;

    const response = await GET(
      new NextRequest("http://localhost/api/orbit/graph", {
        headers: {
          "If-None-Match": buildOrbitGraphETag({
            userId: "user-1",
            cacheVersion: 0,
            scope: "library",
            nodeCap: 1000,
            expandKey: "",
          }),
        },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBeNull();
  });

  it("rejects invalid graph query parameters", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest("http://localhost/api/orbit/graph?nodeCap=0")
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid query parameters");
    expect(prisma.bookmark.findMany).not.toHaveBeenCalled();
    // Malformed requests still spend the graph budget.
    expect(checkRateLimitMock).toHaveBeenCalledWith("orbit:graph", "user-1");
  });

  it("uses the orbit:graph rate limit bucket, not the orbit scan bucket", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.tag.findMany).mockResolvedValue([]);
    vi.mocked(prisma.collection.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bookmark.count).mockResolvedValue(0);
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost/api/orbit/graph")
    );

    expect(response.status).toBe(200);
    expect(checkRateLimitMock).toHaveBeenCalledWith("orbit:graph", "user-1");
    expect(checkRateLimitMock).not.toHaveBeenCalledWith(
      "orbit",
      expect.anything()
    );
  });

  it("returns 429 when the orbit:graph rate limit is exceeded", async () => {
    const { GET } = await import("./route");
    checkRateLimitMock.mockResolvedValue({
      success: false,
      limit: 120,
      remaining: 0,
      reset: Date.now() + 60000,
      retryAfter: 60,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/orbit/graph")
    );
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toBe("Too Many Requests");
    expect(checkRateLimitMock).toHaveBeenCalledWith("orbit:graph", "user-1");
  });
});
