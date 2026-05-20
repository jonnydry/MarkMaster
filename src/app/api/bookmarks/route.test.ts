import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bookmark: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
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
