import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrbitGraphPayload } from "@/types";

const { graphRouteCacheStore } = vi.hoisted(() => ({
  graphRouteCacheStore: new Map<string, unknown>(),
}));

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/upstash-cache", () => ({
  getUserCacheVersion: vi.fn(async () => 1),
  getCachedJson: vi.fn(
    async (key: string, _ttl: number, loader: () => Promise<unknown>) => {
      if (graphRouteCacheStore.has(key)) {
        return graphRouteCacheStore.get(key);
      }
      const value = await loader();
      graphRouteCacheStore.set(key, value);
      return value;
    }
  ),
}));

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
  });
});
