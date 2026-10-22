import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
const findMany = vi.fn(async () => []);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    bookmark: { findMany: (...args: unknown[]) => findMany(...args) },
  },
}));

function sqlText(query: unknown): string {
  if (!query || typeof query !== "object" || !("strings" in query)) return "";
  return (query as { strings: readonly string[] }).strings.join(" ");
}

describe("embedding backfill store scope", () => {
  beforeEach(() => {
    queryRaw.mockReset();
    findMany.mockReset();
    findMany.mockResolvedValue([]);
    queryRaw.mockResolvedValue([]);
  });

  it("lists the whole library when no user is given", async () => {
    const { listBookmarksForEmbedding, listExistingEmbeddingHashes } = await import(
      "./embedding-backfill-store"
    );

    await listBookmarksForEmbedding();
    expect(findMany.mock.calls[0]?.[0]).not.toHaveProperty("where");

    await listExistingEmbeddingHashes("embeddinggemma-2:270m", 768);
    expect(sqlText(queryRaw.mock.calls[0]?.[0])).toContain('FROM "BookmarkEmbedding"');
    expect(sqlText(queryRaw.mock.calls[0]?.[0])).not.toContain('"userId"');
  });

  it("limits bookmarks and hashes to one user", async () => {
    const { listBookmarksForEmbedding, listExistingEmbeddingHashes } = await import(
      "./embedding-backfill-store"
    );

    await listBookmarksForEmbedding("user-1");
    expect(findMany.mock.calls[0]?.[0].where).toEqual({ userId: "user-1" });

    await listExistingEmbeddingHashes("embeddinggemma-2:270m", 768, "user-1");
    const query = queryRaw.mock.calls[0]?.[0] as { values: unknown[] };
    expect(sqlText(query)).toContain('"userId"');
    expect(query.values).toContain("user-1");
  });
});
