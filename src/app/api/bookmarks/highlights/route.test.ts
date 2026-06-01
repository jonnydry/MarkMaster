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

describe("/api/bookmarks/highlights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns performance-ranked highlights through the dedicated SQL path", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ id: "bookmark-2" }, { id: "bookmark-1" }])
      .mockResolvedValueOnce([{ count: 2n }]);
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
      { id: "bookmark-1" },
      { id: "bookmark-2" },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/bookmarks/highlights?limit=2")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.bookmark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["bookmark-2", "bookmark-1"] } },
      })
    );
    expect(body.bookmarks.map((bookmark: { id: string }) => bookmark.id)).toEqual([
      "bookmark-2",
      "bookmark-1",
    ]);
    expect(body.total).toBe(2);
  });

  it("keeps raw highlights limited to completely untouched bookmarks", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0n }]);
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost/api/bookmarks/highlights?raw=true")
    );
    const pageQuery = vi.mocked(prisma.$queryRaw).mock.calls[0]?.[0] as
      | { strings?: readonly string[] }
      | undefined;
    const sql = pageQuery?.strings?.join(" ") ?? "";

    expect(response.status).toBe(200);
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM "BookmarkTag"');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM "CollectionItem"');
  });
});
