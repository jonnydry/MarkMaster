import { Prisma } from "@prisma/client";
import {
  buildBookmarkKeysetSql,
  decodeBookmarkListCursor,
  getPerformanceScoreSql,
  type BookmarkSortField,
} from "@/lib/bookmark-keyset";
import {
  buildBookmarkAuthorFilterSql,
  buildBookmarkSearchTermSql,
} from "@/lib/bookmark-search";
import { DATE_FILTER_TIME_ZONE_SEPARATOR } from "@/lib/validations";

function splitDateFilterValue(value: string): { date: string; timeZone?: string } {
  const separatorIndex = value.indexOf(DATE_FILTER_TIME_ZONE_SEPARATOR);
  if (separatorIndex === -1) return { date: value };
  return {
    date: value.slice(0, separatorIndex),
    timeZone: value.slice(separatorIndex + 1),
  };
}

function getTimeZoneOffsetMs(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  // Some runtimes render midnight as "24" with hour12: false.
  const wallClockAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return wallClockAsUtc - instant.getTime();
}

/** UTC instant of local midnight for a YYYY-MM-DD date in an IANA zone. */
function getZonedDayStart(date: string, timeZone: string) {
  const utcMidnight = new Date(`${date}T00:00:00.000Z`);
  // Second pass converges when the zone offset differs between UTC midnight
  // and the actual local midnight (DST boundaries).
  const guess = new Date(
    utcMidnight.getTime() - getTimeZoneOffsetMs(utcMidnight, timeZone)
  );
  return new Date(utcMidnight.getTime() - getTimeZoneOffsetMs(guess, timeZone));
}

/** Accepts "YYYY-MM-DD" (UTC) or "YYYY-MM-DD@Zone" (day start in that zone). */
export function getDateStart(value: string) {
  const { date, timeZone } = splitDateFilterValue(value);
  return timeZone
    ? getZonedDayStart(date, timeZone)
    : new Date(`${date}T00:00:00.000Z`);
}

export function getNextDateStart(value: string) {
  const { date, timeZone } = splitDateFilterValue(value);
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  if (!timeZone) return next;
  return getZonedDayStart(next.toISOString().slice(0, 10), timeZone);
}

export function buildMediaFilterCondition(
  mediaFilter: "all" | "images" | "video" | "links" | "text-only"
) {
  switch (mediaFilter) {
    case "images":
      return Prisma.sql`
        b."media" IS NOT NULL
        AND b."media" <> 'null'::jsonb
        AND jsonb_path_exists(
          b."media",
          '$[*] ? (@.type == "photo")'
        )
      `;
    case "video":
      return Prisma.sql`
        b."media" IS NOT NULL
        AND b."media" <> 'null'::jsonb
        AND jsonb_path_exists(
          b."media",
          '$[*] ? (@.type == "video" || @.type == "animated_gif")'
        )
      `;
    case "links":
      return Prisma.sql`
        b."urls" IS NOT NULL
        AND b."urls" <> 'null'::jsonb
        AND jsonb_typeof(b."urls") = 'array'
        AND jsonb_array_length(b."urls") > 0
      `;
    case "text-only":
      return Prisma.sql`
        (
          b."media" IS NULL
          OR b."media" = 'null'::jsonb
          OR (jsonb_typeof(b."media") = 'array' AND jsonb_array_length(b."media") = 0)
        )
        AND (
          b."urls" IS NULL
          OR b."urls" = 'null'::jsonb
          OR (jsonb_typeof(b."urls") = 'array' AND jsonb_array_length(b."urls") = 0)
        )
      `;
    default:
      return null;
  }
}

/**
 * Central helper for the two most complex/advanced filters.
 * Both fast path (Prisma) and slow path (raw SQL) call this.
 */
export function applyAdvancedBookmarkFilters(opts: {
  relationFilters?: Prisma.BookmarkWhereInput[];
  sqlConditions?: Prisma.Sql[];
  unaffiliated: boolean;
  raw: boolean;
}) {
  const { relationFilters = [], sqlConditions = [], unaffiliated, raw } = opts;

  if (unaffiliated) {
    relationFilters.push({ tags: { none: {} } });
    sqlConditions.push(Prisma.sql`
      NOT EXISTS (SELECT 1 FROM "BookmarkTag" bt WHERE bt."bookmarkId" = b."id")
    `);

    relationFilters.push({
      collectionItems: {
        none: { collection: { type: "user_collection" } },
      },
    });
    sqlConditions.push(Prisma.sql`
      NOT EXISTS (
        SELECT 1 FROM "CollectionItem" ci
        INNER JOIN "Collection" c ON c."id" = ci."collectionId"
        WHERE ci."bookmarkId" = b."id" AND c."type" = 'user_collection'
      )
    `);
  }

  if (raw) {
    relationFilters.push({ tags: { none: {} } });
    sqlConditions.push(Prisma.sql`
      NOT EXISTS (SELECT 1 FROM "BookmarkTag" bt WHERE bt."bookmarkId" = b."id")
    `);

    relationFilters.push({ collectionItems: { none: {} } });
    sqlConditions.push(Prisma.sql`
      NOT EXISTS (SELECT 1 FROM "CollectionItem" ci WHERE ci."bookmarkId" = b."id")
    `);
  }
}

export function buildSlowPathWhereSql({
  userId,
  searchTerms,
  authorFilter,
  tagIds,
  dateFrom,
  dateTo,
  collectionId,
  bookmarkId,
  mediaFilter,
  unaffiliated,
  raw,
  keysetCursor,
}: {
  userId: string;
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
  keysetCursor?: ReturnType<typeof decodeBookmarkListCursor>;
}) {
  const conditions: Prisma.Sql[] = [Prisma.sql`b."userId" = ${userId}`];

  if (keysetCursor) {
    conditions.push(buildBookmarkKeysetSql(keysetCursor));
  }

  for (const term of searchTerms) {
    conditions.push(buildBookmarkSearchTermSql(term));
  }

  if (authorFilter) {
    conditions.push(buildBookmarkAuthorFilterSql(authorFilter));
  }

  if (tagIds.length > 0) {
    conditions.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM "BookmarkTag" bt
        WHERE bt."bookmarkId" = b."id"
          AND bt."tagId" IN (${Prisma.join(tagIds)})
      )
    `);
  }

  if (dateFrom) {
    conditions.push(Prisma.sql`b."tweetCreatedAt" >= ${getDateStart(dateFrom)}`);
  }

  if (dateTo) {
    conditions.push(Prisma.sql`b."tweetCreatedAt" < ${getNextDateStart(dateTo)}`);
  }

  if (bookmarkId) {
    conditions.push(Prisma.sql`b."id" = ${bookmarkId}`);
  }

  if (collectionId) {
    conditions.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM "CollectionItem" ci
        WHERE ci."bookmarkId" = b."id" AND ci."collectionId" = ${collectionId}
      )
    `);
  }

  applyAdvancedBookmarkFilters({ sqlConditions: conditions, unaffiliated, raw });

  const mediaCondition = buildMediaFilterCondition(mediaFilter);
  if (mediaCondition) {
    conditions.push(mediaCondition);
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

export function getSlowPathOrderSql(sortField: BookmarkSortField) {
  switch (sortField) {
    case "likes":
      return Prisma.sql`COALESCE((b."publicMetrics"->>'like_count')::int, 0)`;
    case "retweets":
      return Prisma.sql`COALESCE((b."publicMetrics"->>'retweet_count')::int, 0)`;
    case "replies":
      return Prisma.sql`COALESCE((b."publicMetrics"->>'reply_count')::int, 0)`;
    case "performance":
      return getPerformanceScoreSql();
    case "tweetCreatedAt":
      return Prisma.sql`b."tweetCreatedAt"`;
    case "authorUsername":
      return Prisma.sql`b."authorUsername"`;
    case "bookmarkedAt":
      return Prisma.sql`b."bookmarkedAt"`;
    default: {
      const _exhaustive: never = sortField;
      return _exhaustive;
    }
  }
}
