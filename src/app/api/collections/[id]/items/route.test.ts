import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  collectionItem: {
    findFirst: vi.fn(),
    upsert: vi.fn(),
    createMany: vi.fn(),
    findMany: vi.fn(),
  },
  $executeRaw: vi.fn(),
};

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/upstash-cache", () => ({
  invalidateUserResponseCache: vi.fn(async () => {}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    collection: {
      findFirst: vi.fn(),
    },
    bookmark: {
      findMany: vi.fn(),
    },
    collectionItem: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx)
    ),
  },
}));

const params = { params: Promise.resolve({ id: "collection-1" }) };

describe("/api/collections/[id]/items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.collectionItem.findFirst.mockResolvedValue({ sortOrder: 2 });
    tx.collectionItem.upsert.mockResolvedValue({
      id: "item-1",
      collectionId: "collection-1",
      bookmarkId: "bookmark-1",
      sortOrder: 3,
    });
    tx.collectionItem.findMany.mockResolvedValue([{ bookmarkId: "bookmark-1" }]);
    tx.$executeRaw.mockResolvedValue(1);
  });

  it("adds a bookmark to a user collection", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { invalidateUserResponseCache } = await import("@/lib/upstash-cache");
    const { POST } = await import("./route");

    vi.mocked(prisma.collection.findFirst).mockResolvedValue({
      id: "collection-1",
      type: "user_collection",
    });
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([{ id: "bookmark-1" }]);

    const response = await POST(
      new NextRequest("http://localhost/api/collections/collection-1/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookmarkId: "bookmark-1" }),
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(tx.collectionItem.upsert).toHaveBeenCalled();
    expect(invalidateUserResponseCache).toHaveBeenCalledWith("user-1");
  });

  it("blocks edits to X-synced folder collections", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { POST } = await import("./route");

    vi.mocked(prisma.collection.findFirst).mockResolvedValue({
      id: "folder-1",
      type: "x_folder",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/collections/folder-1/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookmarkId: "bookmark-1" }),
      }),
      { params: Promise.resolve({ id: "folder-1" }) }
    );

    expect(response.status).toBe(403);
    expect(prisma.bookmark.findMany).not.toHaveBeenCalled();
  });

  it("removes bookmarks from a collection", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { DELETE } = await import("./route");

    vi.mocked(prisma.collection.findFirst).mockResolvedValue({
      id: "collection-1",
      type: "user_collection",
    });
    vi.mocked(prisma.collectionItem.deleteMany).mockResolvedValue({ count: 1 });

    const response = await DELETE(
      new NextRequest("http://localhost/api/collections/collection-1/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookmarkId: "bookmark-1" }),
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(prisma.collectionItem.deleteMany).toHaveBeenCalledWith({
      where: {
        collectionId: "collection-1",
        bookmarkId: { in: ["bookmark-1"] },
      },
    });
  });

  it("reorders collection items in bulk", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { PATCH } = await import("./route");

    vi.mocked(prisma.collection.findFirst).mockResolvedValue({
      id: "collection-1",
      type: "user_collection",
    });
    tx.collectionItem.findMany.mockResolvedValue([
      { bookmarkId: "bookmark-1" },
      { bookmarkId: "bookmark-2" },
    ]);

    const response = await PATCH(
      new NextRequest("http://localhost/api/collections/collection-1/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            { bookmarkId: "bookmark-1", sortOrder: 0 },
            { bookmarkId: "bookmark-2", sortOrder: 1 },
          ],
        }),
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it("rejects reorder requests with missing collection items", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { PATCH } = await import("./route");

    vi.mocked(prisma.collection.findFirst).mockResolvedValue({
      id: "collection-1",
      type: "user_collection",
    });
    tx.collectionItem.findMany.mockResolvedValue([{ bookmarkId: "bookmark-1" }]);

    const response = await PATCH(
      new NextRequest("http://localhost/api/collections/collection-1/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            { bookmarkId: "bookmark-1", sortOrder: 0 },
            { bookmarkId: "bookmark-missing", sortOrder: 1 },
          ],
        }),
      }),
      params
    );

    expect(response.status).toBe(400);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
