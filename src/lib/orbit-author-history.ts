import "server-only";

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

  const hints: Array<{
    authorUsername: string;
    priorCount: number;
    tags: string[];
    collections: string[];
  }> = [];
  await Promise.all(
    unique.map(async (authorUsername) => {
      const history = await getAuthorDecisionHistory(userId, authorUsername);
      if (
        !history ||
        history.priorCount < MIN_PRIOR_HINT_COUNT ||
        (history.tags.length === 0 && history.collections.length === 0)
      ) {
        return;
      }
      hints.push(history);
    })
  );

  return hints.sort((a, b) => b.priorCount - a.priorCount);
}
