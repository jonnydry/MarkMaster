import { Prisma } from "@prisma/client";

const MAX_SEARCH_TERMS = 8;

/**
 * Terms shorter than this are dropped: the pg_trgm indexes cannot serve 1-2
 * character patterns, so they would degrade into worst-case sequential scans.
 * If every term is dropped the request is treated as "no search".
 */
export const MIN_SEARCH_TERM_LENGTH = 2;

export function tokenizeBookmarkSearch(input: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const rawTerm of input.trim().split(/\s+/)) {
    const term = rawTerm.replace(/^[@#]+/, "").trim();
    if (term.length < MIN_SEARCH_TERM_LENGTH) continue;

    const key = term.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    terms.push(term);

    if (terms.length >= MAX_SEARCH_TERMS) break;
  }

  return terms;
}

/** Escape `%` / `_` / `\` so user input is literal inside ILIKE patterns. */
export function escapeIlikePattern(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** `%term%` pattern for pg_trgm GIN indexes (tweetText, author*, Note.content). */
export function bookmarkSearchLikePattern(term: string): string {
  return `%${escapeIlikePattern(term)}%`;
}

/**
 * One search term matched across indexed text columns.
 * Uses ILIKE so existing gin_trgm_ops indexes on Bookmark/Note apply.
 */
export function buildBookmarkSearchTermSql(term: string): Prisma.Sql {
  const pattern = bookmarkSearchLikePattern(term);

  return Prisma.sql`
    (
      b."tweetText" ILIKE ${pattern}
      OR b."authorUsername" ILIKE ${pattern}
      OR b."authorDisplayName" ILIKE ${pattern}
      OR EXISTS (
        SELECT 1
        FROM "Note" n
        WHERE n."bookmarkId" = b."id" AND n."content" ILIKE ${pattern}
      )
    )
  `;
}

export function buildBookmarkAuthorFilterSql(authorFilter: string): Prisma.Sql {
  return Prisma.sql`b."authorUsername" ILIKE ${bookmarkSearchLikePattern(authorFilter)}`;
}
