import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";

// Module-level performance score expression (hoisted; reused by both overlap queries).
// Exact formula matches the established "performance" sort in the bookmarks API
// (log-scaled, weighted toward bookmark_count + replies for best "high-performer" signal).
const PERF_SCORE_SQL = Prisma.sql`(
  1.0 * LN(1 + COALESCE((b."publicMetrics"->>'like_count')::int, 0)) +
  2.0 * LN(1 + COALESCE((b."publicMetrics"->>'retweet_count')::int, 0)) +
  3.5 * LN(1 + COALESCE((b."publicMetrics"->>'reply_count')::int, 0)) +
  2.0 * LN(1 + COALESCE((b."publicMetrics"->>'quote_count')::int, 0)) +
  6.0 * LN(1 + COALESCE((b."publicMetrics"->>'bookmark_count')::int, 0))
)`;

// Row types for $queryRaw results (perf declared as number | string for node-postgres fidelity).
type ColOverlapRow = {
  bookmarkId: string;
  tweetText: string;
  authorUsername: string;
  sharedCollections: string[] | null;
  perf: number | string;
};

type TagOverlapRow = {
  bookmarkId: string;
  tweetText: string;
  authorUsername: string;
  sharedTags: string[] | null;
  perf: number | string;
};

export type SimilarCollectionItem = {
  bookmarkId: string;
  tweetText: string;
  authorUsername: string;
  sharedCollections: string[];
  sharedTags: string[];
  performanceScore?: number;
};

export type SimilarCollectionsData = SimilarCollectionItem[] | null;

export type SimilarCollections =
  | SimilarCollectionsData
  | { loading: true };

/**
 * Lightweight dedicated query (Approach A, reuse of Slice 2 pattern) executed
 * on-demand when the rich edit sheet opens for a bookmark. Returns other
 * high-performing bookmarks (by the established performance score) that share
 * user collections (primary) or tags (secondary) with the target bookmark.
 *
 * Highest-signal weighting: collection overlap count (primary) + performance
 * score (exact high-performer formula) + tag overlap (secondary) + recency.
 * Collection and tag overlap queries execute concurrently (Promise.all) for
 * lowest latency. Limited to small high-signal set (max 6). Excludes self.
 * Returns null when no target or no qualifying overlaps.
 *
 * Returns SimilarCollectionsData (server shape, never the loading sentinel).
 */
export async function getSimilarCollections(
  userId: string,
  bookmarkId: string
): Promise<SimilarCollectionsData> {
  if (!userId || !bookmarkId) return null;

  // Fetch target's collections (user only) and tags for overlap computation.
  const target = await prisma.bookmark.findUnique({
    where: { id: bookmarkId, userId },
    select: {
      collectionItems: {
        where: { collection: { type: "user_collection" } },
        select: {
          collection: { select: { id: true, name: true } },
        },
      },
      tags: {
        select: {
          tag: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!target) return null;

  const targetColIds = target.collectionItems.map((ci) => ci.collection.id);
  const targetTagIds = target.tags.map((t) => t.tag.id);

  if (targetColIds.length === 0 && targetTagIds.length === 0) {
    return null;
  }

  const candidates: SimilarCollectionItem[] = [];

  // Execute collection (primary) and tag (secondary) overlap queries concurrently
  // via Promise.all. They are fully independent; only post-processing dedups.
  // This addresses latency while preserving exact "best signal" ordering.
  const colRowsPromise = targetColIds.length > 0
    ? prisma.$queryRaw<ColOverlapRow[]>`
        SELECT
          b."id" AS "bookmarkId",
          b."tweetText" AS "tweetText",
          b."authorUsername" AS "authorUsername",
          array_agg(DISTINCT c."name" ORDER BY c."name") AS "sharedCollections",
          ${PERF_SCORE_SQL} AS "perf"
        FROM "Bookmark" b
        INNER JOIN "CollectionItem" ci ON ci."bookmarkId" = b."id"
        INNER JOIN "Collection" c ON c."id" = ci."collectionId" AND c."type" = 'user_collection'
        WHERE b."userId" = ${userId}
          AND b."id" <> ${bookmarkId}
          AND c."id" IN (${Prisma.join(targetColIds)})
        GROUP BY b."id", b."tweetText", b."authorUsername"
        ORDER BY array_length(array_agg(DISTINCT c."name"), 1) DESC, "perf" DESC, MAX(b."bookmarkedAt") DESC
        LIMIT 8
      `
    : Promise.resolve<ColOverlapRow[]>([]);

  const tagRowsPromise = targetTagIds.length > 0
    ? prisma.$queryRaw<TagOverlapRow[]>`
        SELECT
          b."id" AS "bookmarkId",
          b."tweetText" AS "tweetText",
          b."authorUsername" AS "authorUsername",
          array_agg(DISTINCT t."name" ORDER BY t."name") AS "sharedTags",
          ${PERF_SCORE_SQL} AS "perf"
        FROM "Bookmark" b
        INNER JOIN "BookmarkTag" bt ON bt."bookmarkId" = b."id"
        INNER JOIN "Tag" t ON t."id" = bt."tagId"
        WHERE b."userId" = ${userId}
          AND b."id" <> ${bookmarkId}
          AND t."id" IN (${Prisma.join(targetTagIds)})
        GROUP BY b."id", b."tweetText", b."authorUsername"
        ORDER BY array_length(array_agg(DISTINCT t."name"), 1) DESC, "perf" DESC, MAX(b."bookmarkedAt") DESC
        LIMIT 8
      `
    : Promise.resolve<TagOverlapRow[]>([]);

  const [colRows, tagRows] = await Promise.all([colRowsPromise, tagRowsPromise]);

  // 1. Collection overlaps (primary signal) — strong preference in final sort.
  for (const r of colRows) {
    candidates.push({
      bookmarkId: r.bookmarkId,
      tweetText: r.tweetText,
      authorUsername: r.authorUsername,
      sharedCollections: r.sharedCollections ?? [],
      sharedTags: [],
      performanceScore: typeof r.perf === "string" ? parseFloat(r.perf) : (r.perf as number),
    });
  }

  // 2. Tag overlaps (secondary) — only add those without collection overlap (dedup).
  const colOverlapIds = new Set(candidates.map((c) => c.bookmarkId));
  for (const r of tagRows) {
    if (colOverlapIds.has(r.bookmarkId)) continue;
    candidates.push({
      bookmarkId: r.bookmarkId,
      tweetText: r.tweetText,
      authorUsername: r.authorUsername,
      sharedCollections: [],
      sharedTags: r.sharedTags ?? [],
      performanceScore: typeof r.perf === "string" ? parseFloat(r.perf) : (r.perf as number),
    });
  }

  if (candidates.length === 0) return null;

  // Final sort: collection overlap count first (primary), then perf desc, then tag count.
  candidates.sort((a, b) => {
    const ac = a.sharedCollections.length;
    const bc = b.sharedCollections.length;
    if (ac !== bc) return bc - ac;
    const ap = a.performanceScore ?? 0;
    const bp = b.performanceScore ?? 0;
    if (Math.abs(ap - bp) > 0.0001) return bp - ap;
    const at = a.sharedTags.length;
    const bt = b.sharedTags.length;
    return bt - at;
  });

  return candidates.slice(0, 6);
}
