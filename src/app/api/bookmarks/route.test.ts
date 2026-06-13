import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/upstash-cache", () => ({
  invalidateUserResponseCache: vi.fn(async () => {}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bookmark: {
      count: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    hiddenBookmark: {
      createMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn((operations: unknown[]) => Promise.all(operations)),
  },
}));

describe("/api/bookmarks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the fast Prisma path for ordinary bookmark queries", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bookmark.count).mockResolvedValue(0);

    const response = await GET(
      new NextRequest("http://localhost/api/bookmarks?mediaFilter=all")
    );

    expect(response.status).toBe(200);
    expect(prisma.bookmark.findMany).toHaveBeenCalledOnce();
    expect(prisma.bookmark.count).toHaveBeenCalledOnce();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("uses indexed SQL search for text queries", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0n }]);
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost/api/bookmarks?search=neural+audio")
    );

    const pageQuery = vi.mocked(prisma.$queryRaw).mock.calls[0]?.[0] as
      | { strings?: readonly string[] }
      | undefined;
    const sql = pageQuery?.strings?.join(" ") ?? "";

    expect(response.status).toBe(200);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.bookmark.count).not.toHaveBeenCalled();
    expect(sql).toContain('"tweetText" ILIKE');
    expect(sql).toContain('"authorUsername" ILIKE');
    expect(sql).toContain('"Note"');
  });

  it("uses indexed SQL search for author filters", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0n }]);
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost/api/bookmarks?authorFilter=measure")
    );

    expect(response.status).toBe(200);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.bookmark.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        skip: expect.any(Number),
      })
    );
  });

  it("keeps X-folder-only bookmarks in the unaffiliated fast path", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bookmark.count).mockResolvedValue(0);

    const response = await GET(
      new NextRequest("http://localhost/api/bookmarks?unaffiliated=true")
    );

    expect(response.status).toBe(200);
    expect(prisma.bookmark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { tags: { none: {} } },
            {
              collectionItems: {
                none: { collection: { type: "user_collection" } },
              },
            },
          ]),
        }),
      })
    );
    expect(prisma.bookmark.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              collectionItems: {
                none: { collection: { type: "user_collection" } },
              },
            },
          ]),
        }),
      })
    );
  });

  it("keeps X-folder-only bookmarks in the unaffiliated SQL media path", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0n }]);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/bookmarks?unaffiliated=true&mediaFilter=images"
      )
    );

    const pageQuery = vi.mocked(prisma.$queryRaw).mock.calls[0]?.[0] as
      | { strings?: readonly string[] }
      | undefined;
    const sql = pageQuery?.strings?.join(" ") ?? "";

    expect(response.status).toBe(200);
    expect(sql).toContain('INNER JOIN "Collection" c ON c."id" = ci."collectionId"');
    expect(sql).toContain("c.\"type\" = 'user_collection'");
  });

  it("uses keyset pagination when a cursor is provided", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");
    const {
      buildBookmarkListCursor,
      encodeBookmarkListCursor,
    } = await import("@/lib/bookmark-keyset");

    const cursor = encodeBookmarkListCursor(
      buildBookmarkListCursor(
        {
          id: "bookmark-prev",
          bookmarkedAt: new Date("2026-05-01T12:00:00.000Z"),
          tweetCreatedAt: new Date("2026-04-30T12:00:00.000Z"),
          authorUsername: "author",
          publicMetrics: null,
        },
        "bookmarkedAt",
        "desc"
      )
    );

    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bookmark.count).mockResolvedValue(0);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/bookmarks?mediaFilter=all&page=2&cursor=${encodeURIComponent(cursor)}`
      )
    );

    expect(response.status).toBe(200);
    expect(prisma.bookmark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 20,
      })
    );
    expect(prisma.bookmark.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        skip: expect.any(Number),
      })
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("rejects invalid cursors", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest("http://localhost/api/bookmarks?cursor=not-a-cursor")
    );

    expect(response.status).toBe(400);
    expect(prisma.bookmark.findMany).not.toHaveBeenCalled();
  });

  it.each(["images", "video", "links", "text-only"] as const)(
    "uses SQL media predicates for %s filters",
    async (mediaFilter) => {
      const { prisma } = await import("@/lib/prisma");
      const { GET } = await import("./route");

      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0n }]);

      const response = await GET(
        new NextRequest(
          `http://localhost/api/bookmarks?mediaFilter=${mediaFilter}`
        )
      );

      expect(response.status).toBe(200);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      expect(prisma.bookmark.count).not.toHaveBeenCalled();
    }
  );

  it.each([
    "dateFrom=2026-02-31",
    "dateFrom=2026-05-02&dateTo=2026-05-01",
    "page=501",
    `search=${"x".repeat(241)}`,
  ])("rejects invalid or expensive query parameters: %s", async (query) => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    const response = await GET(
      new NextRequest(`http://localhost/api/bookmarks?${query}`)
    );

    expect(response.status).toBe(400);
    expect(prisma.bookmark.findMany).not.toHaveBeenCalled();
    expect(prisma.bookmark.count).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("/api/bookmarks DELETE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides and deletes owned bookmarks", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { invalidateUserResponseCache } = await import("@/lib/upstash-cache");
    const { DELETE } = await import("./route");

    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
      { id: "bookmark-1", tweetId: "tweet-1" },
      { id: "bookmark-2", tweetId: "tweet-2" },
    ] as never);
    vi.mocked(prisma.hiddenBookmark.createMany).mockResolvedValue({ count: 2 });
    vi.mocked(prisma.bookmark.deleteMany).mockResolvedValue({ count: 2 });

    const response = await DELETE(
      new NextRequest("http://localhost/api/bookmarks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookmarkIds: ["bookmark-1", "bookmark-2"] }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      hiddenCount: 2,
    });
    expect(prisma.hiddenBookmark.createMany).toHaveBeenCalledWith({
      data: [
        { userId: "user-1", tweetId: "tweet-1" },
        { userId: "user-1", tweetId: "tweet-2" },
      ],
      skipDuplicates: true,
    });
    expect(prisma.bookmark.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["bookmark-1", "bookmark-2"] }, userId: "user-1" },
    });
    expect(invalidateUserResponseCache).toHaveBeenCalledWith("user-1");
  });

  it("returns 404 when any bookmark is missing", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { DELETE } = await import("./route");

    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
      { id: "bookmark-1", tweetId: "tweet-1" },
    ] as never);

    const response = await DELETE(
      new NextRequest("http://localhost/api/bookmarks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookmarkIds: ["bookmark-1", "bookmark-missing"],
        }),
      })
    );

    expect(response.status).toBe(404);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
