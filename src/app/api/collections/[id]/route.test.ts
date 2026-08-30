import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { encodeCollectionItemListCursor } from "@/lib/collection-item-keyset";

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/upstash-cache", () => ({
  invalidateUserResponseCache: vi.fn(async () => {}),
}));

vi.mock("@/lib/public-share-cache", () => ({
  expirePublicShareCache: vi.fn(),
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

  it("searches the full collection and sorts by newest saved", async () => {
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

    const response = await GET(
      new NextRequest(
        "http://localhost/api/collections/collection-1?page=2&q=design&sort=newest"
      ),
      { params: Promise.resolve({ id: "collection-1" }) }
    );

    expect(response.status).toBe(200);
    expect(prisma.collectionItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          collectionId: "collection-1",
          bookmark: expect.objectContaining({ OR: expect.any(Array) }),
        }),
        orderBy: [{ bookmark: { bookmarkedAt: "desc" } }, { id: "desc" }],
        skip: 20,
        take: 20,
      })
    );
    expect(prisma.collectionItem.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        collectionId: "collection-1",
        bookmark: expect.objectContaining({ OR: expect.any(Array) }),
      }),
    });
    await expect(response.json()).resolves.toMatchObject({
      total: 0,
      totalPages: 1,
    });
  });

  it("rejects custom-order cursors for search or date sorting", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");
    const cursor = encodeCollectionItemListCursor({
      sortOrder: 3,
      id: "item-3",
    });

    const response = await GET(
      new NextRequest(
        `http://localhost/api/collections/collection-1?sort=oldest&cursor=${encodeURIComponent(cursor)}`
      ),
      { params: Promise.resolve({ id: "collection-1" }) }
    );

    expect(response.status).toBe(400);
    expect(prisma.collection.findUnique).not.toHaveBeenCalled();
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

  it("stamps a future expiry when setting shareExpiryDays on a public collection", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { PATCH } = await import("./route");

    vi.mocked(prisma.collection.findUnique).mockResolvedValue({
      shareSlug: "slug-1",
      type: "user_collection",
      isPublic: true,
    } as never);
    vi.mocked(prisma.collection.update).mockResolvedValue({
      id: "collection-1",
      shareSlug: "slug-1",
    } as never);

    const before = Date.now();
    const response = await PATCH(
      new NextRequest("http://localhost/api/collections/collection-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareExpiryDays: 7 }),
      }),
      { params: Promise.resolve({ id: "collection-1" }) }
    );
    const after = Date.now();

    expect(response.status).toBe(200);
    const updateArgs = vi.mocked(prisma.collection.update).mock.calls[0][0];
    const shareExpiresAt = (updateArgs.data as { shareExpiresAt: Date }).shareExpiresAt;
    expect(shareExpiresAt).toBeInstanceOf(Date);
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(shareExpiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs);
    expect(shareExpiresAt.getTime()).toBeLessThanOrEqual(after + sevenDaysMs);
  });

  it("clears the expiry when shareExpiryDays is null", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { PATCH } = await import("./route");

    vi.mocked(prisma.collection.findUnique).mockResolvedValue({
      shareSlug: "slug-1",
      type: "user_collection",
      isPublic: true,
    } as never);
    vi.mocked(prisma.collection.update).mockResolvedValue({
      id: "collection-1",
      shareSlug: "slug-1",
    } as never);

    const response = await PATCH(
      new NextRequest("http://localhost/api/collections/collection-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareExpiryDays: null }),
      }),
      { params: Promise.resolve({ id: "collection-1" }) }
    );

    expect(response.status).toBe(200);
    expect(prisma.collection.update).toHaveBeenCalledWith({
      where: { id: "collection-1", userId: "user-1" },
      data: { shareExpiresAt: null },
    });
  });

  it("clears the expiry when unpublishing", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { PATCH } = await import("./route");

    vi.mocked(prisma.collection.findUnique).mockResolvedValue({
      shareSlug: "slug-1",
      type: "user_collection",
      isPublic: true,
    } as never);
    vi.mocked(prisma.collection.update).mockResolvedValue({
      id: "collection-1",
      shareSlug: null,
    } as never);

    const response = await PATCH(
      new NextRequest("http://localhost/api/collections/collection-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: false }),
      }),
      { params: Promise.resolve({ id: "collection-1" }) }
    );

    expect(response.status).toBe(200);
    expect(prisma.collection.update).toHaveBeenCalledWith({
      where: { id: "collection-1", userId: "user-1" },
      data: { isPublic: false, shareSlug: null, shareExpiresAt: null },
    });
  });

  it("rejects unsupported shareExpiryDays values", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new NextRequest("http://localhost/api/collections/collection-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareExpiryDays: 14 }),
      }),
      { params: Promise.resolve({ id: "collection-1" }) }
    );

    expect(response.status).toBe(400);
    expect(prisma.collection.update).not.toHaveBeenCalled();
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
