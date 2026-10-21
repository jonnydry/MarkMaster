import { Prisma } from "@prisma/client";

import {
  buildSlowPathWhereSql,
  getSlowPathOrderSql,
} from "@/lib/bookmark-list-filters";
import {
  EmbeddingProviderError,
  type EmbeddingProvider,
  createEmbeddingProvider,
  createImageTextEmbeddingProvider,
  embedSearchQuery,
} from "@/lib/embedding-provider";
import { logWarn } from "@/lib/logger";
import { toPgVectorLiteral } from "@/lib/pg-vector";
import { prisma } from "@/lib/prisma";
import { reciprocalRankFusion } from "@/lib/reciprocal-rank-fusion";
import { mergeTextAndImageHits, type ScoredHit } from "@/lib/smart-search-merge";
import type { BookmarkSortField } from "@/lib/bookmark-keyset";

/** Top vector neighbors blended with the keyword list. Exact scan, no ANN index. */
export const SMART_SEARCH_VECTOR_LIMIT = 50;

/**
 * Keyword candidates fused with the vector list.
 * The first 200 rows in the request's sort order, not a relevance ranking.
 * The default keyword list stays uncapped.
 */
export const SMART_SEARCH_KEYWORD_LIMIT = 200;

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
  /** Bookmarks whose best image cleared the similarity cutoff. */
  imageHits?: number;
  imageModel?: string;
  imageMatchedIds?: string[];
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
  imageProvider?: EmbeddingProvider;
  queryRaw: QueryRaw;
};

function metadata(
  provider: EmbeddingProvider,
  fallback: SmartSearchFallback | null,
  hits?: {
    vectorHits: number;
    keywordHits: number;
    imageHits?: number;
    imageModel?: string;
    imageMatchedIds?: string[];
  }
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

async function imageEmbeddingsExist(
  queryRaw: QueryRaw,
  userId: string,
  provider: EmbeddingProvider
): Promise<boolean> {
  const rows = await queryRaw<{ imagePresent: boolean }[]>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1
      FROM "BookmarkImageEmbedding" e
      INNER JOIN "Bookmark" b ON b."id" = e."bookmarkId"
      WHERE b."userId" = ${userId}
        AND e."model" = ${provider.model}
        AND e."dims" = ${provider.dims}
    ) AS "imagePresent"
  `);
  return rows[0]?.imagePresent === true;
}

async function vectorHits(
  queryRaw: QueryRaw,
  input: SmartBookmarkSearchInput,
  provider: EmbeddingProvider,
  vectorLiteral: string
): Promise<ScoredHit[]> {
  const whereSql = filterSql(input, []);
  const rows = await queryRaw<{ id: string; distance?: unknown }[]>(Prisma.sql`
    SELECT b."id", (e."embedding" <=> ${vectorLiteral}::vector) AS "distance"
    FROM "Bookmark" b
    INNER JOIN "BookmarkEmbedding" e
      ON e."bookmarkId" = b."id"
     AND e."model" = ${provider.model}
     AND e."dims" = ${provider.dims}
    ${whereSql}
    ORDER BY "distance" ASC, b."id" ASC
    LIMIT ${SMART_SEARCH_VECTOR_LIMIT}
  `);
  return rowsToScoredHits(rows);
}

async function imageHits(
  queryRaw: QueryRaw,
  input: SmartBookmarkSearchInput,
  provider: EmbeddingProvider,
  vectorLiteral: string
): Promise<ScoredHit[]> {
  const whereSql = filterSql(input, []);
  const rows = await queryRaw<{ id: string; distance?: unknown }[]>(Prisma.sql`
    SELECT ranked."id", ranked."distance"
    FROM (
      SELECT b."id" AS "id", MIN(e."embedding" <=> ${vectorLiteral}::vector) AS "distance"
      FROM "Bookmark" b
      INNER JOIN "BookmarkImageEmbedding" e
        ON e."bookmarkId" = b."id"
       AND e."model" = ${provider.model}
       AND e."dims" = ${provider.dims}
      ${whereSql}
      GROUP BY b."id"
    ) ranked
    ORDER BY ranked."distance" ASC, ranked."id" ASC
    LIMIT ${SMART_SEARCH_VECTOR_LIMIT}
  `);
  return rowsToScoredHits(rows);
}

function rowsToScoredHits(rows: Array<{ id: string; distance?: unknown }>): ScoredHit[] {
  const hits: ScoredHit[] = [];
  rows.forEach((row, index) => {
    const distance = readDistance(row);
    if (distance === null) return;
    const similarity = distance === undefined ? 1 - index / 1_000_000 : 1 - distance;
    hits.push({ id: row.id, similarity });
  });
  return hits;
}

/** `undefined` when the row has no distance column (older callers). `null` when it is unusable. */
function readDistance(row: { distance?: unknown }): number | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(row, "distance") || row.distance === undefined) {
    return undefined;
  }
  const value =
    typeof row.distance === "number"
      ? row.distance
      : typeof row.distance === "string"
        ? Number(row.distance)
        : Number.NaN;
  return Number.isFinite(value) ? value : null;
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
    LIMIT ${SMART_SEARCH_KEYWORD_LIMIT}
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
  const imageProvider = deps.imageProvider ?? createImageTextEmbeddingProvider();
  const query = input.search.trim();
  if (!query) {
    return { kind: "fallback", metadata: metadata(provider, "empty_query") };
  }

  let textPresent = false;
  try {
    textPresent = await embeddingsExist(queryRaw, input.userId, provider);
  } catch (error) {
    logWarn("smart-search", "Text embedding lookup failed", error);
    textPresent = false;
  }

  let imagePresent = false;
  try {
    imagePresent = await imageEmbeddingsExist(queryRaw, input.userId, imageProvider);
  } catch (error) {
    logWarn("smart-search", "Image embedding lookup failed", error);
    imagePresent = false;
  }

  if (!textPresent && !imagePresent) {
    logWarn("smart-search", "No embeddings stored; using keyword search");
    return { kind: "fallback", metadata: metadata(provider, "no_embeddings") };
  }

  const embedded = await embedQuerySides(provider, imageProvider, query, textPresent, imagePresent);
  if (!embedded.textVector && !embedded.imageVector) {
    return { kind: "fallback", metadata: metadata(provider, embedded.reason) };
  }

  let textLiteral: string | null = null;
  let imageLiteral: string | null = null;
  try {
    if (embedded.textVector) textLiteral = toPgVectorLiteral(embedded.textVector, provider.dims);
    if (embedded.imageVector) imageLiteral = toPgVectorLiteral(embedded.imageVector, imageProvider.dims);
  } catch {
    if (!textLiteral && !imageLiteral) {
      return { kind: "fallback", metadata: metadata(provider, "provider_unavailable") };
    }
  }

  try {
    const [textScored, imageScored, keywordIds] = await Promise.all([
      textLiteral ? vectorHits(queryRaw, input, provider, textLiteral) : Promise.resolve([]),
      imageLiteral ? imageHits(queryRaw, input, imageProvider, imageLiteral) : Promise.resolve([]),
      keywordHitIds(queryRaw, input),
    ]);
    const merged = imageLiteral
      ? mergeTextAndImageHits(textScored, imageScored)
      : { orderedIds: textScored.map((hit) => hit.id), imageMatchedIds: [] as string[] };
    const fused = reciprocalRankFusion([merged.orderedIds, keywordIds]);
    return {
      kind: "ranked",
      orderedIds: fused.map((row) => row.id),
      metadata: metadata(provider, null, {
        vectorHits: textScored.length,
        keywordHits: keywordIds.length,
        ...(imageLiteral
          ? {
              imageHits: merged.imageMatchedIds.length,
              imageModel: imageProvider.model,
              imageMatchedIds: merged.imageMatchedIds,
            }
          : {}),
      }),
    };
  } catch (error) {
    logWarn("smart-search", "Vector search failed; using keyword search", error);
    return { kind: "fallback", metadata: metadata(provider, "no_embeddings") };
  }
}

async function embedQuerySides(
  provider: EmbeddingProvider,
  imageProvider: EmbeddingProvider,
  query: string,
  textPresent: boolean,
  imagePresent: boolean
): Promise<{ textVector: number[] | null; imageVector: number[] | null; reason: SmartSearchFallback }> {
  let textVector: number[] | null = null;
  let imageVector: number[] | null = null;
  let textReason: SmartSearchFallback | null = null;
  let imageReason: SmartSearchFallback | null = null;

  await Promise.all([
    textPresent
      ? embedSearchQuery(provider, query)
          .then((vector) => {
            textVector = vector;
          })
          .catch((error: unknown) => {
            textReason = embeddingFailureReason(error);
            logWarn("smart-search", `Embedding provider fallback (${textReason})`);
          })
      : Promise.resolve(),
    imagePresent
      ? embedSearchQuery(imageProvider, query)
          .then((vector) => {
            imageVector = vector;
          })
          .catch((error: unknown) => {
            imageReason = embeddingFailureReason(error);
            logWarn("smart-search", `Image embedding provider fallback (${imageReason})`);
          })
      : Promise.resolve(),
  ]);

  return {
    textVector,
    imageVector,
    reason: textReason ?? imageReason ?? "provider_unavailable",
  };
}

function embeddingFailureReason(error: unknown): SmartSearchFallback {
  return error instanceof EmbeddingProviderError ? error.reason : "provider_unavailable";
}
