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
      const likes = metricCount(bookmark.publicMetrics, "like_count");
      const retweets = metricCount(bookmark.publicMetrics, "retweet_count");
      const replies = metricCount(bookmark.publicMetrics, "reply_count");
      const quotes = metricCount(bookmark.publicMetrics, "quote_count");
      const bookmarks = metricCount(bookmark.publicMetrics, "bookmark_count");
      return (
        1.0 * Math.log(1 + likes) +
        2.0 * Math.log(1 + retweets) +
        3.5 * Math.log(1 + replies) +
        2.0 * Math.log(1 + quotes) +
        6.0 * Math.log(1 + bookmarks)
      );
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

function compareOperator(direction: "asc" | "desc", step: "primary" | "tie") {
  if (direction === "desc") {
    return step === "primary" ? "<" : "<";
  }
  return step === "primary" ? ">" : ">";
}

export function buildBookmarkKeysetSql(
  cursor: BookmarkListCursor
): Prisma.Sql {
  const primaryOp = compareOperator(cursor.sortDirection, "primary");
  const tieOp = compareOperator(cursor.sortDirection, "tie");

  switch (cursor.sortField) {
    case "bookmarkedAt": {
      const sortValue = new Date(String(cursor.sortValue));
      return Prisma.sql`
        (
          b."bookmarkedAt" ${Prisma.raw(primaryOp)} ${sortValue}
          OR (b."bookmarkedAt" = ${sortValue} AND b."id" ${Prisma.raw(tieOp)} ${cursor.id})
        )
      `;
    }
    case "tweetCreatedAt": {
      const sortValue = new Date(String(cursor.sortValue));
      return Prisma.sql`
        (
          b."tweetCreatedAt" ${Prisma.raw(primaryOp)} ${sortValue}
          OR (b."tweetCreatedAt" = ${sortValue} AND b."id" ${Prisma.raw(tieOp)} ${cursor.id})
        )
      `;
    }
    case "authorUsername": {
      const sortValue = String(cursor.sortValue);
      return Prisma.sql`
        (
          b."authorUsername" ${Prisma.raw(primaryOp)} ${sortValue}
          OR (b."authorUsername" = ${sortValue} AND b."id" ${Prisma.raw(tieOp)} ${cursor.id})
        )
      `;
    }
    case "likes": {
      const sortValue = Number(cursor.sortValue);
      return Prisma.sql`
        (
          COALESCE((b."publicMetrics"->>'like_count')::int, 0) ${Prisma.raw(primaryOp)} ${sortValue}
          OR (
            COALESCE((b."publicMetrics"->>'like_count')::int, 0) = ${sortValue}
            AND b."id" ${Prisma.raw(tieOp)} ${cursor.id}
          )
        )
      `;
    }
    case "retweets": {
      const sortValue = Number(cursor.sortValue);
      return Prisma.sql`
        (
          COALESCE((b."publicMetrics"->>'retweet_count')::int, 0) ${Prisma.raw(primaryOp)} ${sortValue}
          OR (
            COALESCE((b."publicMetrics"->>'retweet_count')::int, 0) = ${sortValue}
            AND b."id" ${Prisma.raw(tieOp)} ${cursor.id}
          )
        )
      `;
    }
    case "replies": {
      const sortValue = Number(cursor.sortValue);
      return Prisma.sql`
        (
          COALESCE((b."publicMetrics"->>'reply_count')::int, 0) ${Prisma.raw(primaryOp)} ${sortValue}
          OR (
            COALESCE((b."publicMetrics"->>'reply_count')::int, 0) = ${sortValue}
            AND b."id" ${Prisma.raw(tieOp)} ${cursor.id}
          )
        )
      `;
    }
    case "performance": {
      const sortValue = Number(cursor.sortValue);
      const scoreSql = getPerformanceScoreSql();
      return Prisma.sql`
        (
          ${scoreSql} ${Prisma.raw(primaryOp)} ${sortValue}
          OR (
            ${scoreSql} = ${sortValue}
            AND b."id" ${Prisma.raw(tieOp)} ${cursor.id}
          )
        )
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
