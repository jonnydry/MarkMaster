import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(async () => []),
    tag: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock("@/lib/upstash-cache", () => ({
  getUserCachedJson: vi.fn(
    async (
      _userId: string,
      _key: string,
      _ttl: number,
      producer: () => Promise<unknown>,
    ) => ({ value: await producer(), version: 3 }),
  ),
}));

function sqlText(arg: unknown): string {
  if (Array.isArray(arg)) return arg.join("");
  return String(arg ?? "");
}

describe("/api/analytics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("excludes tag-audit rejections from scan reject counts", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost/api/analytics"));

    expect(response.status).toBe(200);
    const decisionQuery = vi
      .mocked(prisma.$queryRaw)
      .mock.calls.map((call) => sqlText(call[0]))
      .find((sql) => sql.includes('FROM "OrbitDecisionEvent"'));
    expect(decisionQuery).toContain("tag-audit");
    expect(decisionQuery).toMatch(/source/);
  });
});
