import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bookmark: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

describe("/api/orbit/scan-candidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses indexed SQL search for candidate queries with a search term", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: "bookmark-1" }]);
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
      { id: "bookmark-1" },
    ]);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/orbit/scan-candidates?search=ai&page=2&pageSize=20&limit=50&sortDirection=asc"
      )
    );
    const body = await response.json();

    const pageQuery = vi.mocked(prisma.$queryRaw).mock.calls[0]?.[0] as
      | { strings?: readonly string[] }
      | undefined;
    const sql = pageQuery?.strings?.join(" ") ?? "";

    expect(response.status).toBe(200);
    expect(body.bookmarks).toEqual([{ id: "bookmark-1" }]);
    expect(sql).toContain('"tweetText" ILIKE');
    expect(sql).toContain("user_collection");
    expect(prisma.bookmark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["bookmark-1"] } },
      })
    );
  });

  it("uses Prisma for unaffiliated candidates without search", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
      { id: "bookmark-1" },
    ]);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/orbit/scan-candidates?page=2&pageSize=20&limit=50&sortDirection=asc"
      )
    );

    expect(response.status).toBe(200);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.bookmark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          AND: expect.arrayContaining([
            { tags: { none: {} } },
            {
              collectionItems: {
                none: { collection: { type: "user_collection" } },
              },
            },
          ]),
        }),
        orderBy: { bookmarkedAt: "asc" },
        skip: 20,
        take: 50,
      })
    );
  });
});
