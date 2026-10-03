import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

vi.mock("@/lib/upstash-cache", () => ({
  getUserCachedJson: vi.fn(
    async (
      _userId: string,
      _key: string,
      _ttl: number,
      producer: () => Promise<unknown>
    ) => ({ value: await producer(), version: 3 })
  ),
}));

describe("/api/analytics/top-authors", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only the lightweight author payload", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
      {
        author: "maker",
        displayName: "Maker",
        profileImage: null,
        verified: true,
        count: BigInt(12),
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      topAuthors: [
        {
          author: "maker",
          displayName: "Maker",
          profileImage: null,
          verified: true,
          count: 12,
        },
      ],
    });
  });
});
