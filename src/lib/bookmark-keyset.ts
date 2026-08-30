import { Prisma } from "@prisma/client";
import type { Prisma as PrismaTypes } from "@prisma/client";

export const BOOKMARK_SORT_FIELDS = [
  "bookmarkedAt",
  "tweetCreatedAt",
  "authorUsername",
  "likes",
  "retweets",
  "replies",
  "performance",
] as const;

export type BookmarkSortField = (typeof BOOKMARK_SORT_FIELDS)[number];

export interface BookmarkListCursor {
  sortField: BookmarkSortField;
  sortDirection: "asc" | "desc";
  sortValue: string | number;
  id: string;
}

type BookmarkCursorSource = {
  id: string;
  bookmarkedAt: Date;
  tweetCreatedAt: Date;
  authorUsername: string;
  publicMetrics: PrismaTypes.JsonValue | null;
};

const CURSOR_VERSION = 1;
const MAX_CURSOR_BYTES = 512;

type EncodedBookmarkListCursor = BookmarkListCursor & { v: number };

export function getPerformanceScoreSql() {
  return Prisma.sql`(
    1.0 * LN(1 + COALESCE((b."publicMetrics"->>'like_count')::int, 0)) +
    2.0 * LN(1 + COALESCE((b."publicMetrics"->>'retweet_count')::int, 0)) +
    3.5 * LN(1 + COALESCE((b."publicMetrics"->>'reply_count')::int, 0)) +
    2.0 * LN(1 + COALESCE((b."publicMetrics"->>'quote_count')::int, 0)) +
    6.0 * LN(1 + COALESCE((b."publicMetrics"->>'bookmark_count')::int, 0))
  )`;
}

/**
 * Same score expression as {@link getPerformanceScoreSql}, rebuilt from the
 * raw counts a performance cursor carries. Both sides of the keyset
 * comparison are then computed by Postgres with the identical expression, so
 * the tie between the boundary row and itself matches exactly — comparing a
 * JS `Math.log` float against Postgres `LN` can be off by an ULP, which made
 * the tie branch unreachable and occasionally skipped/duplicated a row.
 */
function getPerformanceScoreFromCountsSql(counts: PerformanceCursorCounts) {
  const [likes, retweets, replies, quotes, bookmarks] = counts;
  return Prisma.sql`(
    1.0 * LN(1 + ${likes}::int) +
    2.0 * LN(1 + ${retweets}::int) +
    3.5 * LN(1 + ${replies}::int) +
    2.0 * LN(1 + ${quotes}::int) +
    6.0 * LN(1 + ${bookmarks}::int)
  )`;
}

/** `[likes, retweets, replies, quotes, bookmarks]` — the score's raw inputs. */
type PerformanceCursorCounts = [number, number, number, number, number];

/**
 * Performance cursors store `sortValue` as `"likes,retweets,replies,quotes,bookmarks"`.
 * Returns null for anything else — including legacy v1 cursors that carried a
 * JS-computed float, which callers keep handling as a plain numeric boundary.
 */
export function parsePerformanceCursorCounts(
  sortValue: string | number
): PerformanceCursorCounts | null {
  if (typeof sortValue !== "string") return null;

  const parts = sortValue.split(",");
  if (parts.length !== 5) return null;

  const counts = parts.map((part) => Number(part));
  if (!counts.every((count) => Number.isInteger(count) && count >= 0)) {
    return null;
  }

  return counts as PerformanceCursorCounts;
}

function metricCount(
  publicMetrics: PrismaTypes.JsonValue | null,
  key: string
): number {
  if (!publicMetrics || typeof publicMetrics !== "object" || Array.isArray(publicMetrics)) {
    return 0;
  }

  const value = (publicMetrics as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function getBookmarkSortValue(
  bookmark: BookmarkCursorSource,
  sortField: BookmarkSortField
): string | number {
  switch (sortField) {
    case "bookmarkedAt":
      return bookmark.bookmarkedAt.toISOString();
    case "tweetCreatedAt":
      return bookmark.tweetCreatedAt.toISOString();
    case "authorUsername":
      return bookmark.authorUsername;
    case "likes":
      return metricCount(bookmark.publicMetrics, "like_count");
    case "retweets":
      return metricCount(bookmark.publicMetrics, "retweet_count");
    case "replies":
      return metricCount(bookmark.publicMetrics, "reply_count");
    case "performance": {
      // Carry the raw metric inputs instead of a JS-computed float; SQL
      // rebuilds the score from them (see getPerformanceScoreFromCountsSql).
      return [
        metricCount(bookmark.publicMetrics, "like_count"),
        metricCount(bookmark.publicMetrics, "retweet_count"),
        metricCount(bookmark.publicMetrics, "reply_count"),
        metricCount(bookmark.publicMetrics, "quote_count"),
        metricCount(bookmark.publicMetrics, "bookmark_count"),
      ].join(",");
    }
    default: {
      const _exhaustive: never = sortField;
      return _exhaustive;
    }
  }
}

export function buildBookmarkListCursor(
  bookmark: BookmarkCursorSource,
  sortField: BookmarkSortField,
  sortDirection: "asc" | "desc"
): BookmarkListCursor {
  return {
    sortField,
    sortDirection,
    sortValue: getBookmarkSortValue(bookmark, sortField),
    id: bookmark.id,
  };
}

export function encodeBookmarkListCursor(cursor: BookmarkListCursor): string {
  const payload: EncodedBookmarkListCursor = { ...cursor, v: CURSOR_VERSION };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeBookmarkListCursor(raw: string): BookmarkListCursor | null {
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    if (Buffer.byteLength(decoded, "utf8") > MAX_CURSOR_BYTES) {
      return null;
    }

    const parsed = JSON.parse(decoded) as Partial<EncodedBookmarkListCursor>;
    if (parsed.v !== CURSOR_VERSION) return null;
    if (!parsed.id || typeof parsed.id !== "string") return null;
    if (parsed.sortDirection !== "asc" && parsed.sortDirection !== "desc") return null;
    if (
      !parsed.sortField ||
      !(BOOKMARK_SORT_FIELDS as readonly string[]).includes(parsed.sortField)
    ) {
      return null;
    }
    if (
      typeof parsed.sortValue !== "string" &&
      typeof parsed.sortValue !== "number"
    ) {
      return null;
    }
    if (
      (parsed.sortField === "likes" ||
        parsed.sortField === "retweets" ||
        parsed.sortField === "replies") &&
      typeof parsed.sortValue !== "number"
    ) {
      return null;
    }
    if (
      parsed.sortField === "performance" &&
      typeof parsed.sortValue === "string" &&
      parsePerformanceCursorCounts(parsed.sortValue) === null
    ) {
      // Numbers are still accepted here: legacy v1 performance cursors
      // carried a JS-computed float and keep working (see buildBookmarkKeysetSql).
      return null;
    }

    return {
      sortField: parsed.sortField,
      sortDirection: parsed.sortDirection,
      sortValue: parsed.sortValue,
      id: parsed.id,
    };
  } catch {
    return null;
  }
}

export function cursorMatchesRequest(
  cursor: BookmarkListCursor,
  sortField: BookmarkSortField,
  sortDirection: "asc" | "desc"
) {
  return cursor.sortField === sortField && cursor.sortDirection === sortDirection;
}

/**
 * Keyset predicates use Postgres row-value comparison —
 * `(expr, "id") < (value, cursorId)` — rather than the equivalent
 * `expr < value OR (expr = value AND ...)` form: the row-value form can be
 * driven as a single range scan and evaluates the sort expression once per
 * row instead of twice.
 */
export function buildBookmarkKeysetSql(
  cursor: BookmarkListCursor
): Prisma.Sql {
  const op = Prisma.raw(cursor.sortDirection === "desc" ? "<" : ">");

  switch (cursor.sortField) {
    case "bookmarkedAt": {
      const sortValue = new Date(String(cursor.sortValue));
      return Prisma.sql`
        (b."bookmarkedAt", b."id") ${op} (${sortValue}, ${cursor.id})
      `;
    }
    case "tweetCreatedAt": {
      const sortValue = new Date(String(cursor.sortValue));
      return Prisma.sql`
        (b."tweetCreatedAt", b."id") ${op} (${sortValue}, ${cursor.id})
      `;
    }
    case "authorUsername": {
      const sortValue = String(cursor.sortValue);
      return Prisma.sql`
        (b."authorUsername", b."id") ${op} (${sortValue}, ${cursor.id})
      `;
    }
    case "likes": {
      const sortValue = Number(cursor.sortValue);
      return Prisma.sql`
        (COALESCE((b."publicMetrics"->>'like_count')::int, 0), b."id") ${op} (${sortValue}, ${cursor.id})
      `;
    }
    case "retweets": {
      const sortValue = Number(cursor.sortValue);
      return Prisma.sql`
        (COALESCE((b."publicMetrics"->>'retweet_count')::int, 0), b."id") ${op} (${sortValue}, ${cursor.id})
      `;
    }
    case "replies": {
      const sortValue = Number(cursor.sortValue);
      return Prisma.sql`
        (COALESCE((b."publicMetrics"->>'reply_count')::int, 0), b."id") ${op} (${sortValue}, ${cursor.id})
      `;
    }
    case "performance": {
      const counts = parsePerformanceCursorCounts(cursor.sortValue);
      // Legacy v1 cursors carried a JS-computed float; compare against it
      // directly (old semantics — ties may not match exactly) so in-flight
      // cursors keep paginating instead of erroring.
      const boundarySql = counts
        ? getPerformanceScoreFromCountsSql(counts)
        : Prisma.sql`${Number(cursor.sortValue)}`;
      return Prisma.sql`
        (${getPerformanceScoreSql()}, b."id") ${op} (${boundarySql}, ${cursor.id})
      `;
    }
    default: {
      const _exhaustive: never = cursor.sortField;
      return _exhaustive;
    }
  }
}

export function buildPrismaBookmarkKeysetFilter(
  cursor: BookmarkListCursor
): PrismaTypes.BookmarkWhereInput {
  const isDesc = cursor.sortDirection === "desc";

  switch (cursor.sortField) {
    case "bookmarkedAt": {
      const sortValue = new Date(String(cursor.sortValue));
      return isDesc
        ? {
            OR: [
              { bookmarkedAt: { lt: sortValue } },
              { bookmarkedAt: sortValue, id: { lt: cursor.id } },
            ],
          }
        : {
            OR: [
              { bookmarkedAt: { gt: sortValue } },
              { bookmarkedAt: sortValue, id: { gt: cursor.id } },
            ],
          };
    }
    case "tweetCreatedAt": {
      const sortValue = new Date(String(cursor.sortValue));
      return isDesc
        ? {
            OR: [
              { tweetCreatedAt: { lt: sortValue } },
              { tweetCreatedAt: sortValue, id: { lt: cursor.id } },
            ],
          }
        : {
            OR: [
              { tweetCreatedAt: { gt: sortValue } },
              { tweetCreatedAt: sortValue, id: { gt: cursor.id } },
            ],
          };
    }
    case "authorUsername": {
      const sortValue = String(cursor.sortValue);
      return isDesc
        ? {
            OR: [
              { authorUsername: { lt: sortValue } },
              { authorUsername: sortValue, id: { lt: cursor.id } },
            ],
          }
        : {
            OR: [
              { authorUsername: { gt: sortValue } },
              { authorUsername: sortValue, id: { gt: cursor.id } },
            ],
          };
    }
    default:
      throw new Error(
        `Prisma keyset filter does not support sort field "${cursor.sortField}"`
      );
  }
}

export function buildBookmarkListNextCursor(
  bookmarks: BookmarkCursorSource[],
  sortField: BookmarkSortField,
  sortDirection: "asc" | "desc",
  limit: number
): string | undefined {
  if (bookmarks.length < limit) return undefined;

  const last = bookmarks[bookmarks.length - 1];
  return encodeBookmarkListCursor(
    buildBookmarkListCursor(last, sortField, sortDirection)
  );
}
