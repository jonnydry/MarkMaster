import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { encodeCollectionItemListCursor } from "@/lib/collection-item-keyset";

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/upstash-cache", () => ({
  invalidateUserResponseCache: vi.fn(async () => {}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    collection: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    collectionItem: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe("/api/collections/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses keyset pagination when a cursor is provided", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.collection.findUnique).mockResolvedValue({
      id: "collection-1",
      name: "Test",
      description: null,
      type: "user_collection",
      isPublic: false,
      shareSlug: null,
      externalSource: null,
      externalSourceId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.mocked(prisma.collectionItem.findMany).mockResolvedValue([]);
    vi.mocked(prisma.collectionItem.count).mockResolvedValue(0);

    const cursor = encodeCollectionItemListCursor({
      sortOrder: 3,
      id: "item-3",
    });

    const response = await GET(
      new NextRequest(
        `http://localhost/api/collections/collection-1?page=2&cursor=${encodeURIComponent(cursor)}`
      ),
      { params: Promise.resolve({ id: "collection-1" }) }
    );

    expect(response.status).toBe(200);
    expect(prisma.collectionItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          collectionId: "collection-1",
          OR: [
            { sortOrder: { gt: 3 } },
            { sortOrder: 3, id: { gt: "item-3" } },
          ],
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        take: 20,
      })
    );
    expect(prisma.collectionItem.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        skip: expect.any(Number),
      })
    );
  });

  it("rejects invalid cursors", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.collection.findUnique).mockResolvedValue({
      id: "collection-1",
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/collections/collection-1?cursor=not-a-cursor"
      ),
      { params: Promise.resolve({ id: "collection-1" }) }
    );

    expect(response.status).toBe(400);
    expect(prisma.collectionItem.findMany).not.toHaveBeenCalled();
  });

  it("updates a user collection and invalidates cache", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { invalidateUserResponseCache } = await import("@/lib/upstash-cache");
    const { PATCH } = await import("./route");

    vi.mocked(prisma.collection.findUnique).mockResolvedValue({
      shareSlug: null,
      type: "user_collection",
    } as never);
    vi.mocked(prisma.collection.update).mockResolvedValue({
      id: "collection-1",
      name: "Renamed",
    } as never);

    const response = await PATCH(
      new NextRequest("http://localhost/api/collections/collection-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Renamed" }),
      }),
      { params: Promise.resolve({ id: "collection-1" }) }
    );

    expect(response.status).toBe(200);
    expect(prisma.collection.update).toHaveBeenCalledWith({
      where: { id: "collection-1", userId: "user-1" },
      data: { name: "Renamed" },
    });
    expect(invalidateUserResponseCache).toHaveBeenCalledWith("user-1");
  });

  it("blocks renaming X-synced folder collections", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { PATCH } = await import("./route");

    vi.mocked(prisma.collection.findUnique).mockResolvedValue({
      shareSlug: null,
      type: "x_folder",
    } as never);

    const response = await PATCH(
      new NextRequest("http://localhost/api/collections/folder-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Renamed" }),
      }),
      { params: Promise.resolve({ id: "folder-1" }) }
    );

    expect(response.status).toBe(403);
    expect(prisma.collection.update).not.toHaveBeenCalled();
  });

  it("deletes a user collection", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { DELETE } = await import("./route");

    vi.mocked(prisma.collection.findUnique).mockResolvedValue({
      type: "user_collection",
    } as never);
    vi.mocked(prisma.collection.delete).mockResolvedValue({
      id: "collection-1",
    } as never);

    const response = await DELETE(
      new NextRequest("http://localhost/api/collections/collection-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "collection-1" }) }
    );

    expect(response.status).toBe(200);
    expect(prisma.collection.delete).toHaveBeenCalledWith({
      where: { id: "collection-1", userId: "user-1" },
    });
  });

  it("blocks deleting X-synced folder collections", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { DELETE } = await import("./route");

    vi.mocked(prisma.collection.findUnique).mockResolvedValue({
      type: "x_folder",
    } as never);

    const response = await DELETE(
      new NextRequest("http://localhost/api/collections/folder-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "folder-1" }) }
    );

    expect(response.status).toBe(403);
    expect(prisma.collection.delete).not.toHaveBeenCalled();
  });
});
