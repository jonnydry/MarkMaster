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

import { clearQueryEmbeddingCache, EMBEDDING_DIMS, SMART_SEARCH_EMBED_TIMEOUT_MS } from "@/lib/embedding-provider";
import { resetQueryEmbedCircuit } from "@/lib/smart-bookmark-search";

function sqlText(query: unknown): string {
  if (!query || typeof query !== "object" || !("strings" in query)) return "";
  return (query as { strings: readonly string[] }).strings.join(" ");
}

function vector(): number[] {
  return Array.from({ length: EMBEDDING_DIMS }, () => 0.2);
}

async function flushMicrotasks(turns = 60): Promise<void> {
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
}

describe("smart bookmark search mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    clearQueryEmbeddingCache();
    resetQueryEmbedCircuit();
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
    expect(body.bookmarks.every((bookmark: { imageMatch?: boolean }) => bookmark.imageMatch !== true)).toBe(
      true
    );
  });

  it("marks bookmarks that matched by image", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { GET } = await import("./route");

    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ embeddings: [vector()] }),
    }));
    vi.mocked(prisma.$queryRaw).mockImplementation(async (query: unknown) => {
      const sql = sqlText(query);
      if (sql.includes('AS "imagePresent"')) return [{ imagePresent: true }];
      if (sql.includes('AS "present"')) return [{ present: true }];
      if (sql.includes("BookmarkImageEmbedding")) return [{ id: "v1", distance: 0.1 }];
      if (sql.includes("<=>")) return [{ id: "both", distance: 0.2 }];
      if (sql.includes("ILIKE")) return [{ id: "both" }];
      return [];
    });
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
      { id: "v1", media: null, urls: null },
      { id: "both", media: null, urls: null },
    ] as never);

    const response = await GET(
      new NextRequest("http://localhost/api/bookmarks?search=rust&mode=smart")
    );
    const body = await response.json();

    expect(body.bookmarks.find((bookmark: { id: string }) => bookmark.id === "v1")?.imageMatch).toBe(
      true
    );
    expect(body.bookmarks.find((bookmark: { id: string }) => bookmark.id === "both")?.imageMatch).toBeUndefined();
    expect(body.search.imageHits).toBe(1);
    expect(body.search.imageModel).toBe("embeddinggemma-2:440m-q8_0-text-vision");
  });

  it("returns ranked bookmarks as soon as the embed resolves", async () => {
    vi.useFakeTimers();
    vi.stubEnv("SMART_SEARCH_EMBED_TIMEOUT_MS", String(SMART_SEARCH_EMBED_TIMEOUT_MS));
    try {
      const { prisma } = await import("@/lib/prisma");
      const { GET } = await import("./route");
      let resolveEmbed: (value: { ok: boolean; json: () => Promise<{ embeddings: number[][] }> }) => void =
        () => {};
      vi.stubGlobal(
        "fetch",
        () =>
          new Promise((resolve) => {
            resolveEmbed = resolve;
          })
      );
      vi.mocked(prisma.$queryRaw).mockImplementation(async (query: unknown) => {
        const sql = sqlText(query);
        if (sql.includes('AS "imagePresent"')) return [{ imagePresent: false }];
        if (sql.includes('AS "present"')) return [{ present: true }];
        if (sql.includes("<=>")) return [{ id: "v1", distance: 0.2 }, { id: "both", distance: 0.3 }];
        if (sql.includes("ILIKE")) return [{ id: "both" }, { id: "k1" }];
        return [];
      });
      vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
        { id: "k1", media: null, urls: null },
        { id: "v1", media: null, urls: null },
        { id: "both", media: null, urls: null },
      ] as never);

      const started = Date.now();
      let settled = false;
      const pending = GET(new NextRequest("http://localhost/api/bookmarks?search=rust&mode=smart")).then(
        (response) => {
          settled = true;
          return response;
        }
      );

      await flushMicrotasks();
      expect(settled).toBe(false);

      resolveEmbed({
        ok: true,
        json: async () => ({ embeddings: [vector()] }),
      });
      await flushMicrotasks();

      expect(settled).toBe(true);
      expect(Date.now()).toBe(started);
      expect(vi.getTimerCount()).toBe(0);
      const response = await pending;
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.bookmarks.map((bookmark: { id: string }) => bookmark.id)).toEqual(["both", "v1", "k1"]);
      expect(body.search).toMatchObject({ mode: "smart", fallback: null });
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
  });

  it("returns keyword bookmarks when the embed exceeds the timeout", async () => {
    vi.useFakeTimers();
    vi.stubEnv("SMART_SEARCH_EMBED_TIMEOUT_MS", String(SMART_SEARCH_EMBED_TIMEOUT_MS));
    try {
      const { prisma } = await import("@/lib/prisma");
      const { GET } = await import("./route");
      vi.stubGlobal(
        "fetch",
        (_url: string, init: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            });
          })
      );
      vi.mocked(prisma.$queryRaw).mockImplementation(async (query: unknown) => {
        const sql = sqlText(query);
        if (sql.includes('AS "imagePresent"')) return [{ imagePresent: false }];
        if (sql.includes('AS "present"')) return [{ present: true }];
        if (sql.includes("COUNT")) return [{ count: 1n }];
        if (sql.includes("ILIKE")) return [{ id: "kw-1" }];
        return [];
      });
      vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
        { id: "kw-1", media: null, urls: null },
      ] as never);

      let settled = false;
      const pending = GET(new NextRequest("http://localhost/api/bookmarks?search=rust&mode=smart")).then(
        (response) => {
          settled = true;
          return response;
        }
      );

      await flushMicrotasks();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(SMART_SEARCH_EMBED_TIMEOUT_MS - 1);
      await flushMicrotasks();
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await flushMicrotasks();
      expect(settled).toBe(true);

      const response = await pending;
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.bookmarks.map((bookmark: { id: string }) => bookmark.id)).toEqual(["kw-1"]);
      expect(body.search).toMatchObject({ mode: "smart", fallback: "timeout" });
      const statements = vi.mocked(prisma.$queryRaw).mock.calls.map((call) => sqlText(call[0]));
      expect(statements.some((sql) => sql.includes('"tweetText" ILIKE'))).toBe(true);
      expect(statements.some((sql) => sql.includes("<=>"))).toBe(false);
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
  });

  it("returns text and keyword bookmarks when the image embed exceeds the timeout", async () => {
    vi.useFakeTimers();
    vi.stubEnv("SMART_SEARCH_EMBED_TIMEOUT_MS", String(SMART_SEARCH_EMBED_TIMEOUT_MS));
    try {
      const { prisma } = await import("@/lib/prisma");
      const { GET } = await import("./route");
      vi.stubGlobal("fetch", (_url: string, init: { body?: BodyInit | null; signal?: AbortSignal }) => {
        const model = JSON.parse(String(init.body)).model as string;
        if (!String(model).includes("text-vision")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ embeddings: [vector()] }),
          });
        }
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        });
      });
      vi.mocked(prisma.$queryRaw).mockImplementation(async (query: unknown) => {
        const sql = sqlText(query);
        if (sql.includes('AS "imagePresent"')) return [{ imagePresent: true }];
        if (sql.includes('AS "present"')) return [{ present: true }];
        if (sql.includes("BookmarkImageEmbedding")) return [{ id: "pic", distance: 0.1 }];
        if (sql.includes("<=>")) return [{ id: "note", distance: 0.2 }];
        if (sql.includes("ILIKE")) return [{ id: "note" }, { id: "kw-1" }];
        return [];
      });
      vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
        { id: "note", media: null, urls: null },
        { id: "kw-1", media: null, urls: null },
      ] as never);

      let settled = false;
      const pending = GET(new NextRequest("http://localhost/api/bookmarks?search=rust&mode=smart")).then(
        (response) => {
          settled = true;
          return response;
        }
      );

      await flushMicrotasks();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(SMART_SEARCH_EMBED_TIMEOUT_MS);
      await flushMicrotasks();
      expect(settled).toBe(true);

      const response = await pending;
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.bookmarks.map((bookmark: { id: string }) => bookmark.id)).toEqual(["note", "kw-1"]);
      expect(body.search).toMatchObject({ mode: "smart", fallback: null, vectorHits: 1 });
      expect(body.search.imageHits).toBeUndefined();
      expect(body.bookmarks.every((bookmark: { imageMatch?: boolean }) => bookmark.imageMatch !== true)).toBe(
        true
      );
      const statements = vi.mocked(prisma.$queryRaw).mock.calls.map((call) => sqlText(call[0]));
      expect(statements.some((sql) => sql.includes("BookmarkImageEmbedding") && sql.includes("<=>"))).toBe(
        false
      );
      expect(statements.some((sql) => sql.includes('"tweetText" ILIKE'))).toBe(true);
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
  });
});
