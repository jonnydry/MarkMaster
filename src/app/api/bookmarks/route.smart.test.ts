import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/upstash-cache", () => ({
  invalidateUserResponseCache: vi.fn(async () => {}),
}));

vi.mock("@/lib/bookmark-card-urls", () => ({
  withBookmarkCardUrls: vi.fn(async (rows: unknown[]) => rows),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bookmark: {
      count: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    hiddenBookmark: { createMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

import { clearQueryEmbeddingCache, EMBEDDING_DIMS } from "@/lib/embedding-provider";

function sqlText(query: unknown): string {
  if (!query || typeof query !== "object" || !("strings" in query)) return "";
  return (query as { strings: readonly string[] }).strings.join(" ");
}

function vector(): number[] {
  return Array.from({ length: EMBEDDING_DIMS }, () => 0.2);
}

describe("smart bookmark search mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    clearQueryEmbeddingCache();
  });

  it("keeps the default search response free of smart-search metadata", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0n }]);

    const response = await GET(new NextRequest("http://localhost/api/bookmarks?search=neural+audio"));
    const body = await response.json();
    const pageQuery = vi.mocked(prisma.$queryRaw).mock.calls[0]?.[0];
    const sql = sqlText(pageQuery);

    expect(response.status).toBe(200);
    expect(body.search).toBeUndefined();
    expect(Object.keys(body).sort()).toEqual(["bookmarks", "page", "total", "totalPages"]);
    expect(sql).toContain('"tweetText" ILIKE');
    expect(sql).not.toContain("BookmarkEmbedding");
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("rejects an unknown search mode before querying", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    const response = await GET(new NextRequest("http://localhost/api/bookmarks?mode=keyword"));

    expect(response.status).toBe(400);
    expect(prisma.bookmark.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("falls back to keyword search when the local model is unreachable", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);
    vi.mocked(prisma.$queryRaw).mockImplementation(async (query: unknown) => {
      const sql = sqlText(query);
      if (sql.includes('AS "present"')) return [{ present: true }];
      if (sql.includes("COUNT")) return [{ count: 0n }];
      return [];
    });

    const response = await GET(
      new NextRequest("http://localhost/api/bookmarks?search=neural&mode=smart")
    );
    const body = await response.json();
    const statements = vi.mocked(prisma.$queryRaw).mock.calls.map((call) => sqlText(call[0]));

    expect(response.status).toBe(200);
    expect(body.search).toMatchObject({
      mode: "smart",
      fallback: "provider_unavailable",
      model: "embeddinggemma-2:270m",
      dims: 768,
    });
    expect(body.bookmarks).toEqual([]);
    expect(statements.some((sql) => sql.includes('"tweetText" ILIKE'))).toBe(true);
    expect(statements.some((sql) => sql.includes("<=>"))).toBe(false);
  });

  it("falls back when the library has no stored embeddings", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);
    vi.mocked(prisma.$queryRaw).mockImplementation(async (query: unknown) => {
      const sql = sqlText(query);
      if (sql.includes('AS "present"')) return [{ present: false }];
      if (sql.includes("COUNT")) return [{ count: 0n }];
      return [];
    });

    const response = await GET(
      new NextRequest("http://localhost/api/bookmarks?search=neural&mode=smart")
    );
    const body = await response.json();

    expect(body.search.fallback).toBe("no_embeddings");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns fused ids ahead of the keyword order when smart search succeeds", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ embeddings: [vector()] }),
    }));
    vi.mocked(prisma.$queryRaw).mockImplementation(async (query: unknown) => {
      const sql = sqlText(query);
      if (sql.includes('AS "present"')) return [{ present: true }];
      if (sql.includes("<=>")) return [{ id: "v1" }, { id: "both" }];
      if (sql.includes("ILIKE")) return [{ id: "both" }, { id: "k1" }];
      return [];
    });
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
      { id: "k1", media: null, urls: null },
      { id: "v1", media: null, urls: null },
      { id: "both", media: null, urls: null },
    ] as never);

    const response = await GET(
      new NextRequest("http://localhost/api/bookmarks?search=rust&mode=smart")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.bookmarks.map((bookmark: { id: string }) => bookmark.id)).toEqual([
      "both",
      "v1",
      "k1",
    ]);
    expect(body.search).toMatchObject({ mode: "smart", fallback: null, vectorHits: 2, keywordHits: 2 });
    expect(body.nextCursor).toBeUndefined();
    expect(body.total).toBe(3);
  });
});
