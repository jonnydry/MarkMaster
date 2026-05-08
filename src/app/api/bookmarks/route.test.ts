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
});
