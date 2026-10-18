import { Prisma } from "@prisma/client";

import {
  buildSlowPathWhereSql,
  getSlowPathOrderSql,
} from "@/lib/bookmark-list-filters";
import {
  EmbeddingProviderError,
  type EmbeddingProvider,
  createEmbeddingProvider,
  embedSearchQuery,
} from "@/lib/embedding-provider";
import { logWarn } from "@/lib/logger";
import { toPgVectorLiteral } from "@/lib/pg-vector";
import { prisma } from "@/lib/prisma";
import { reciprocalRankFusion } from "@/lib/reciprocal-rank-fusion";
import type { BookmarkSortField } from "@/lib/bookmark-keyset";

/** Top vector neighbors blended with the keyword list. Exact scan, no ANN index. */
export const SMART_SEARCH_VECTOR_LIMIT = 50;

export type SmartSearchFallback =
  | "timeout"
  | "provider_unavailable"
  | "no_embeddings"
  | "empty_query";

export type SmartSearchMetadata = {
  mode: "smart";
  fallback: SmartSearchFallback | null;
  model: string;
  dims: number;
  vectorHits?: number;
  keywordHits?: number;
};

export type SmartSearchOutcome =
  | {
      kind: "ranked";
      orderedIds: string[];
      metadata: SmartSearchMetadata;
    }
  | {
      kind: "fallback";
      metadata: SmartSearchMetadata;
    };

type QueryRaw = <T>(query: TemplateStringsArray | Prisma.Sql) => Promise<T>;

export type SmartBookmarkSearchInput = {
  userId: string;
  search: string;
  searchTerms: string[];
  authorFilter: string;
  tagIds: string[];
  dateFrom?: string;
  dateTo?: string;
  collectionId?: string;
  bookmarkId?: string;
  mediaFilter: "all" | "images" | "video" | "links" | "text-only";
  unaffiliated: boolean;
  raw: boolean;
  sortField: BookmarkSortField;
  sortDirection: "asc" | "desc";
};

type SmartSearchDeps = {
  provider: EmbeddingProvider;
  queryRaw: QueryRaw;
};

function metadata(
  provider: EmbeddingProvider,
  fallback: SmartSearchFallback | null,
  hits?: { vectorHits: number; keywordHits: number }
): SmartSearchMetadata {
  return {
    mode: "smart",
    fallback,
    model: provider.model,
    dims: provider.dims,
    ...hits,
  };
}

function filterSql(
  input: SmartBookmarkSearchInput,
  searchTerms: string[]
) {
  return buildSlowPathWhereSql({
    userId: input.userId,
    searchTerms,
    authorFilter: input.authorFilter,
    tagIds: input.tagIds,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    collectionId: input.collectionId,
    bookmarkId: input.bookmarkId,
    mediaFilter: input.mediaFilter,
    unaffiliated: input.unaffiliated,
    raw: input.raw,
  });
}

async function embeddingsExist(
  queryRaw: QueryRaw,
  userId: string,
  provider: EmbeddingProvider
): Promise<boolean> {
  const rows = await queryRaw<{ present: boolean }[]>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1
      FROM "BookmarkEmbedding" e
      INNER JOIN "Bookmark" b ON b."id" = e."bookmarkId"
      WHERE b."userId" = ${userId}
        AND e."model" = ${provider.model}
        AND e."dims" = ${provider.dims}
    ) AS "present"
  `);
  return rows[0]?.present === true;
}

async function vectorHitIds(
  queryRaw: QueryRaw,
  input: SmartBookmarkSearchInput,
  provider: EmbeddingProvider,
  vectorLiteral: string
): Promise<string[]> {
  const whereSql = filterSql(input, []);
  const rows = await queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT b."id"
    FROM "Bookmark" b
    INNER JOIN "BookmarkEmbedding" e
      ON e."bookmarkId" = b."id"
     AND e."model" = ${provider.model}
     AND e."dims" = ${provider.dims}
    ${whereSql}
    ORDER BY e."embedding" <=> ${vectorLiteral}::vector ASC, b."id" ASC
    LIMIT ${SMART_SEARCH_VECTOR_LIMIT}
  `);
  return rows.map((row) => row.id);
}

async function keywordHitIds(
  queryRaw: QueryRaw,
  input: SmartBookmarkSearchInput
): Promise<string[]> {
  if (input.searchTerms.length === 0) return [];
  const whereSql = filterSql(input, input.searchTerms);
  const orderSql = getSlowPathOrderSql(input.sortField);
  const directionSql = Prisma.raw(input.sortDirection.toUpperCase());
  const rows = await queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT b."id"
    FROM "Bookmark" b
    ${whereSql}
    ORDER BY ${orderSql} ${directionSql}, b."id" ${directionSql}
  `);
  return rows.map((row) => row.id);
}

/**
 * Blend the top vector hits with the current keyword hits.
 * Caller falls back to today's list when `kind` is `fallback`.
 */
export async function trySmartBookmarkSearch(
  input: SmartBookmarkSearchInput,
  deps: SmartSearchDeps = {
    provider: createEmbeddingProvider(),
    queryRaw: prisma.$queryRaw.bind(prisma),
  }
): Promise<SmartSearchOutcome> {
  const { provider, queryRaw } = deps;
  const query = input.search.trim();
  if (!query) {
    return { kind: "fallback", metadata: metadata(provider, "empty_query") };
  }

  let present = false;
  try {
    present = await embeddingsExist(queryRaw, input.userId, provider);
  } catch (error) {
    logWarn("smart-search", "Embedding lookup failed; using keyword search", error);
    return { kind: "fallback", metadata: metadata(provider, "no_embeddings") };
  }

  if (!present) {
    logWarn("smart-search", "No embeddings stored; using keyword search");
    return { kind: "fallback", metadata: metadata(provider, "no_embeddings") };
  }

  let vector: number[];
  try {
    vector = await embedSearchQuery(provider, query);
  } catch (error) {
    const reason =
      error instanceof EmbeddingProviderError ? error.reason : "provider_unavailable";
    logWarn("smart-search", `Embedding provider fallback (${reason})`);
    return { kind: "fallback", metadata: metadata(provider, reason) };
  }

  let literal: string;
  try {
    literal = toPgVectorLiteral(vector, provider.dims);
  } catch {
    return { kind: "fallback", metadata: metadata(provider, "provider_unavailable") };
  }

  try {
    const [vectorIds, keywordIds] = await Promise.all([
      vectorHitIds(queryRaw, input, provider, literal),
      keywordHitIds(queryRaw, input),
    ]);
    const fused = reciprocalRankFusion([vectorIds, keywordIds]);
    return {
      kind: "ranked",
      orderedIds: fused.map((row) => row.id),
      metadata: metadata(provider, null, {
        vectorHits: vectorIds.length,
        keywordHits: keywordIds.length,
      }),
    };
  } catch (error) {
    logWarn("smart-search", "Vector search failed; using keyword search", error);
    return { kind: "fallback", metadata: metadata(provider, "no_embeddings") };
  }
}
