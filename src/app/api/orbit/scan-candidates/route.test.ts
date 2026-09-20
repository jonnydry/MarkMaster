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
    // The route trims the payload (Speed-H3): heavyweight JSON blobs come
    // back as explicit nulls so the client type contract is unchanged.
    expect(body.bookmarks).toEqual([
      { id: "bookmark-1", quotedTweet: null, xMetadata: null },
    ]);
    expect(sql).toContain('"tweetText" ILIKE');
    expect(sql).toContain("user_collection");
    expect(prisma.bookmark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["bookmark-1"] } },
        select: expect.not.objectContaining({
          quotedTweet: true,
          xMetadata: true,
        }),
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

  it("selects compact rows without quotedTweet/xMetadata blobs", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
      { id: "bookmark-1", tweetText: "hello", urls: [] },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/orbit/scan-candidates")
    );
    const body = await response.json();

    const findManyArgs = vi.mocked(prisma.bookmark.findMany).mock.calls[0]?.[0];
    expect(findManyArgs).not.toHaveProperty("include");
    expect(findManyArgs?.select).toMatchObject({
      id: true,
      tweetText: true,
      urls: true,
      media: true,
      publicMetrics: true,
      tags: expect.anything(),
      notes: expect.anything(),
      collectionItems: expect.anything(),
    });
    expect(findManyArgs?.select).not.toHaveProperty("quotedTweet");
    expect(findManyArgs?.select).not.toHaveProperty("xMetadata");

    expect(body.bookmarks[0]).toMatchObject({
      id: "bookmark-1",
      quotedTweet: null,
      xMetadata: null,
    });
  });
});
