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
  },
}));

describe("/api/orbit/scan-candidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unaffiliated candidates using current search and sort context", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
      { id: "bookmark-1" },
    ]);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/orbit/scan-candidates?search=ai&page=2&pageSize=20&limit=50&sortDirection=asc"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.bookmarks).toEqual([{ id: "bookmark-1" }]);
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
            expect.objectContaining({
              OR: expect.arrayContaining([
                { tweetText: { contains: "ai", mode: "insensitive" } },
              ]),
            }),
          ]),
        }),
        orderBy: { bookmarkedAt: "asc" },
        skip: 20,
        take: 50,
      })
    );
  });
});
