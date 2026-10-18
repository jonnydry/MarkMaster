import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearQueryEmbeddingCache, EmbeddingProviderError, EMBEDDING_DIMS } from "./embedding-provider";
import { toPgVectorLiteral } from "./pg-vector";
import {
  SMART_SEARCH_KEYWORD_LIMIT,
  trySmartBookmarkSearch,
  type SmartBookmarkSearchInput,
} from "./smart-bookmark-search";

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

function sqlText(query: unknown): string {
  if (!query || typeof query !== "object" || !("strings" in query)) return "";
  return (query as { strings: readonly string[] }).strings.join(" ");
}

function sqlValues(query: unknown): unknown[] {
  if (!query || typeof query !== "object" || !("values" in query)) return [];
  return [...(query as { values: unknown[] }).values];
}

function input(overrides: Partial<SmartBookmarkSearchInput> = {}): SmartBookmarkSearchInput {
  return {
    userId: "user-1",
    search: "rust lifetimes",
    searchTerms: ["rust", "lifetimes"],
    authorFilter: "ada",
    tagIds: ["tag-1"],
    mediaFilter: "all",
    unaffiliated: false,
    raw: false,
    sortField: "bookmarkedAt",
    sortDirection: "desc",
    ...overrides,
  };
}

function provider(embed: Embedding["embed"] = async () => [Array.from({ length: EMBEDDING_DIMS }, () => 0.1)]) {
  return {
    model: "embeddinggemma-2:270m",
    dims: EMBEDDING_DIMS,
    embed: vi.fn(embed),
  };
}

type Embedding = {
  embed: (texts: readonly string[], kind: "query" | "document") => Promise<number[][]>;
};

describe("trySmartBookmarkSearch", () => {
  beforeEach(() => {
    clearQueryEmbeddingCache();
  });

  it("fuses vector hits and keyword hits and keeps filters on both queries", async () => {
    const embedder = provider();
    const queryRaw = vi.fn(async (query: Prisma.Sql) => {
      const sql = sqlText(query);
      if (sql.includes('AS "present"')) return [{ present: true }];
      if (sql.includes("<=>")) return [{ id: "v1" }, { id: "both" }];
      if (sql.includes("ILIKE")) return [{ id: "both" }, { id: "k1" }];
      return [];
    });

    const result = await trySmartBookmarkSearch(input(), { provider: embedder, queryRaw });

    expect(result.kind).toBe("ranked");
    if (result.kind !== "ranked") return;
    expect(result.orderedIds).toEqual(["both", "v1", "k1"]);
    expect(result.metadata).toMatchObject({
      mode: "smart",
      fallback: null,
      model: "embeddinggemma-2:270m",
      dims: 768,
      vectorHits: 2,
      keywordHits: 2,
    });

    const statements = queryRaw.mock.calls.map((call) => sqlText(call[0]));
    const vectorSql = statements.find((sql) => sql.includes("<=>")) ?? "";
    const keywordSql = statements.find((sql) => sql.includes('"tweetText" ILIKE')) ?? "";
    expect(vectorSql).toContain('"BookmarkEmbedding"');
    expect(vectorSql).not.toContain('"tweetText" ILIKE');
    expect(vectorSql).toContain('"authorUsername" ILIKE');
    expect(keywordSql).toContain('"tweetText" ILIKE');
    expect(keywordSql).not.toContain("<=>");

    const vectorValues = sqlValues(queryRaw.mock.calls.find((call) => sqlText(call[0]).includes("<=>"))?.[0]);
    const keywordValues = sqlValues(
      queryRaw.mock.calls.find((call) => sqlText(call[0]).includes('"tweetText" ILIKE'))?.[0]
    );
    expect(vectorValues).toEqual(expect.arrayContaining(["user-1", "embeddinggemma-2:270m", 768, "tag-1"]));
    expect(keywordValues).toEqual(expect.arrayContaining(["user-1", "tag-1"]));
    expect(vectorValues.some((value) => typeof value === "string" && value.includes("%ada%"))).toBe(true);
    expect(embedder.embed).toHaveBeenCalledTimes(1);
  });

  it("caps keyword candidates at 200 before fusion", async () => {
    expect(SMART_SEARCH_KEYWORD_LIMIT).toBe(200);
    const keywordMatches = Array.from({ length: SMART_SEARCH_KEYWORD_LIMIT + 50 }, (_, index) => ({
      id: `kw-${index}`,
    }));
    const queryRaw = vi.fn(async (query: Prisma.Sql) => {
      const sql = sqlText(query);
      if (sql.includes('AS "present"')) return [{ present: true }];
      if (sql.includes("<=>")) return [];
      if (sql.includes('"tweetText" ILIKE')) {
        const values = sqlValues(query);
        const requested = values.at(-1);
        const limit =
          sql.includes("LIMIT") && typeof requested === "number" ? requested : keywordMatches.length;
        return keywordMatches.slice(0, limit);
      }
      return [];
    });

    const result = await trySmartBookmarkSearch(input(), { provider: provider(), queryRaw });

    expect(result.kind).toBe("ranked");
    if (result.kind !== "ranked") return;
    expect(result.metadata.keywordHits).toBe(SMART_SEARCH_KEYWORD_LIMIT);
    expect(result.orderedIds).toEqual(keywordMatches.slice(0, SMART_SEARCH_KEYWORD_LIMIT).map((row) => row.id));
    expect(result.orderedIds).not.toContain(`kw-${SMART_SEARCH_KEYWORD_LIMIT}`);

    const keywordQuery = queryRaw.mock.calls
      .map((call) => call[0])
      .find((query) => sqlText(query).includes('"tweetText" ILIKE'));
    expect(sqlText(keywordQuery)).toContain("LIMIT");
    expect(sqlValues(keywordQuery).at(-1)).toBe(SMART_SEARCH_KEYWORD_LIMIT);
  });

  it("falls back when no embeddings are stored", async () => {
    const embedder = provider();
    const queryRaw = vi.fn(async () => [{ present: false }]);
    const result = await trySmartBookmarkSearch(input(), { provider: embedder, queryRaw });

    expect(result).toMatchObject({
      kind: "fallback",
      metadata: { fallback: "no_embeddings", mode: "smart" },
    });
    expect(embedder.embed).not.toHaveBeenCalled();
  });

  it("falls back when the provider times out", async () => {
    const embedder = provider(async () => {
      throw new EmbeddingProviderError("timeout");
    });
    const queryRaw = vi.fn(async (query: Prisma.Sql) => {
      if (sqlText(query).includes('AS "present"')) return [{ present: true }];
      return [];
    });

    const result = await trySmartBookmarkSearch(input(), { provider: embedder, queryRaw });
    expect(result).toMatchObject({ kind: "fallback", metadata: { fallback: "timeout" } });
  });

  it("falls back when the provider is unreachable", async () => {
    const embedder = provider(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const queryRaw = vi.fn(async () => [{ present: true }]);
    const result = await trySmartBookmarkSearch(input(), { provider: embedder, queryRaw });
    expect(result).toMatchObject({
      kind: "fallback",
      metadata: { fallback: "provider_unavailable" },
    });
  });

  it("does not call the provider for an empty query", async () => {
    const embedder = provider();
    const queryRaw = vi.fn();
    const result = await trySmartBookmarkSearch(input({ search: "   ", searchTerms: [] }), {
      provider: embedder,
      queryRaw,
    });
    expect(result).toMatchObject({ kind: "fallback", metadata: { fallback: "empty_query" } });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(embedder.embed).not.toHaveBeenCalled();
  });

  it("reuses the cached query embedding", async () => {
    const embedder = provider();
    const queryRaw = vi.fn(async (query: Prisma.Sql) => {
      const sql = sqlText(query);
      if (sql.includes("EXISTS")) return [{ present: true }];
      return [];
    });
    await trySmartBookmarkSearch(input(), { provider: embedder, queryRaw });
    await trySmartBookmarkSearch(input(), { provider: embedder, queryRaw });
    expect(embedder.embed).toHaveBeenCalledTimes(1);
  });
});

describe("toPgVectorLiteral", () => {
  it("formats a finite vector and rejects the wrong shape", () => {
    expect(toPgVectorLiteral([1, 0.5], 2)).toBe("[1,0.5]");
    expect(() => toPgVectorLiteral([1], 2)).toThrow(/2-dimensional/);
    expect(() => toPgVectorLiteral([Number.NaN, 1], 2)).toThrow(/non-finite/);
  });
});
