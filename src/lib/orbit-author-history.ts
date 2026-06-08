import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type AuthorDecisionHistoryData =
  | {
      authorUsername: string;
      priorCount: number;
      tags: string[];
      collections: string[];
    }
  | null;

export type AuthorDecisionHistory =
  | AuthorDecisionHistoryData
  | { authorUsername: string; loading: true };

/**
 * Lightweight dedicated query (Approach A) executed on-demand when the
 * rich edit sheet opens. Returns real historical tags + user_collections
 * (never the client-only loading sentinel) for the given author, aggregated
 * server-side by frequency + recency. Limited high-signal set.
 *
 * Returns AuthorDecisionHistoryData (the server shape).
 */
export async function getAuthorDecisionHistory(
  userId: string,
  authorUsername: string
): Promise<AuthorDecisionHistoryData> {
  if (!userId || !authorUsername) return null;

  const priorCount = await prisma.bookmark.count({
    where: { userId, authorUsername },
  });

  if (priorCount === 0) {
    return null;
  }

  // Tags: most-used + most-recently-used on this author's bookmarks
  const tagRows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT t."name" AS name
    FROM "Bookmark" b
    INNER JOIN "BookmarkTag" bt ON bt."bookmarkId" = b."id"
    INNER JOIN "Tag" t ON t."id" = bt."tagId"
    WHERE b."userId" = ${userId} AND b."authorUsername" = ${authorUsername}
    GROUP BY t."name"
    ORDER BY COUNT(*) DESC, MAX(b."bookmarkedAt") DESC
    LIMIT 8
  `;

  // User collections: most-used + most-recent on this author's bookmarks
  const colRows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT c."name" AS name
    FROM "Bookmark" b
    INNER JOIN "CollectionItem" ci ON ci."bookmarkId" = b."id"
    INNER JOIN "Collection" c ON c."id" = ci."collectionId"
    WHERE b."userId" = ${userId}
      AND b."authorUsername" = ${authorUsername}
      AND c."type" = 'user_collection'
    GROUP BY c."name"
    ORDER BY COUNT(*) DESC, MAX(b."bookmarkedAt") DESC
    LIMIT 6
  `;

  return {
    authorUsername,
    priorCount,
    tags: tagRows.map((r) => r.name),
    collections: colRows.map((r) => r.name),
  };
}

const MIN_PRIOR_HINT_COUNT = 2;

/**
 * Batch-fetch author prior-decision hints for an Orbit scan.
 * Only returns authors with enough history and at least one tag or collection signal.
 */
export async function getAuthorPriorHintsForScan(
  userId: string,
  authorUsernames: string[]
): Promise<
  Array<{
    authorUsername: string;
    priorCount: number;
    tags: string[];
    collections: string[];
  }>
> {
  const unique = [
    ...new Set(
      authorUsernames.map((username) => username.trim()).filter(Boolean)
    ),
  ];
  if (unique.length === 0) return [];

  const [countRows, tagRows, collectionRows] = await Promise.all([
    prisma.bookmark.groupBy({
      by: ["authorUsername"],
      where: {
        userId,
        authorUsername: { in: unique },
      },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ authorUsername: string; name: string }[]>(Prisma.sql`
      SELECT ranked."authorUsername", ranked."name"
      FROM (
        SELECT
          b."authorUsername",
          t."name",
          ROW_NUMBER() OVER (
            PARTITION BY b."authorUsername"
            ORDER BY COUNT(*) DESC, MAX(b."bookmarkedAt") DESC
          ) AS rank
        FROM "Bookmark" b
        INNER JOIN "BookmarkTag" bt ON bt."bookmarkId" = b."id"
        INNER JOIN "Tag" t ON t."id" = bt."tagId"
        WHERE b."userId" = ${userId}
          AND b."authorUsername" IN (${Prisma.join(unique)})
        GROUP BY b."authorUsername", t."name"
      ) ranked
      WHERE ranked.rank <= 8
      ORDER BY ranked."authorUsername" ASC, ranked.rank ASC
    `),
    prisma.$queryRaw<{ authorUsername: string; name: string }[]>(Prisma.sql`
      SELECT ranked."authorUsername", ranked."name"
      FROM (
        SELECT
          b."authorUsername",
          c."name",
          ROW_NUMBER() OVER (
            PARTITION BY b."authorUsername"
            ORDER BY COUNT(*) DESC, MAX(b."bookmarkedAt") DESC
          ) AS rank
        FROM "Bookmark" b
        INNER JOIN "CollectionItem" ci ON ci."bookmarkId" = b."id"
        INNER JOIN "Collection" c ON c."id" = ci."collectionId"
        WHERE b."userId" = ${userId}
          AND b."authorUsername" IN (${Prisma.join(unique)})
          AND c."type" = 'user_collection'
        GROUP BY b."authorUsername", c."name"
      ) ranked
      WHERE ranked.rank <= 6
      ORDER BY ranked."authorUsername" ASC, ranked.rank ASC
    `),
  ]);

  const priorCountByAuthor = new Map(
    countRows.map((row) => [row.authorUsername, row._count._all])
  );
  const tagsByAuthor = new Map<string, string[]>();
  const collectionsByAuthor = new Map<string, string[]>();

  for (const row of tagRows) {
    const tags = tagsByAuthor.get(row.authorUsername) ?? [];
    tags.push(row.name);
    tagsByAuthor.set(row.authorUsername, tags);
  }

  for (const row of collectionRows) {
    const collections = collectionsByAuthor.get(row.authorUsername) ?? [];
    collections.push(row.name);
    collectionsByAuthor.set(row.authorUsername, collections);
  }

  const hints = unique.flatMap((authorUsername) => {
    const priorCount = priorCountByAuthor.get(authorUsername) ?? 0;
    const tags = tagsByAuthor.get(authorUsername) ?? [];
    const collections = collectionsByAuthor.get(authorUsername) ?? [];
    if (
      priorCount < MIN_PRIOR_HINT_COUNT ||
      (tags.length === 0 && collections.length === 0)
    ) {
      return [];
    }

    return [{ authorUsername, priorCount, tags, collections }];
  });

  return hints.sort((a, b) => b.priorCount - a.priorCount);
}
