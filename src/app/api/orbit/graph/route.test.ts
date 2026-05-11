import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrbitGraphPayload } from "@/types";

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
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
      "private, max-age=0, must-revalidate"
    );
    expect(payload.nodes).toContainEqual({
      kind: "tag",
      id: "tag-generated-color",
      name: "History",
      color: "#1569cb",
      count: 3,
    });
  });
});
