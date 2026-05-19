import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { tokenizeBookmarkSearch } from "@/lib/bookmark-search";
import { bookmarksQuerySchema, deleteBookmarkSchema } from "@/lib/validations";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";

const bookmarkInclude = {
  tags: { include: { tag: true } },
  notes: { select: { id: true, content: true } },
  collectionItems: {
    include: { collection: { select: { id: true, name: true } } },
  },
} as const;

function getDateStart(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function getNextDateStart(value: string) {
  const next = getDateStart(value);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function buildMediaFilterCondition(
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
 *
 * This is the main weapon against duplication when we later add more sophisticated
 * filters (e.g. personalization for Highlights).
 */
function applyAdvancedFilters(opts: {
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

function buildSlowPathWhereSql({
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
}) {
  const conditions: Prisma.Sql[] = [Prisma.sql`b."userId" = ${userId}`];

  for (const term of searchTerms) {
    const searchLike = `%${term}%`;
    conditions.push(Prisma.sql`
      (
        b."tweetText" ILIKE ${searchLike}
        OR b."authorUsername" ILIKE ${searchLike}
        OR b."authorDisplayName" ILIKE ${searchLike}
        OR EXISTS (
          SELECT 1
          FROM "Note" n
          WHERE n."bookmarkId" = b."id" AND n."content" ILIKE ${searchLike}
        )
      )
    `);
  }

  if (authorFilter) {
    conditions.push(Prisma.sql`b."authorUsername" ILIKE ${`%${authorFilter}%`}`);
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

  applyAdvancedFilters({ sqlConditions: conditions, unaffiliated, raw });

  const mediaCondition = buildMediaFilterCondition(mediaFilter);
  if (mediaCondition) {
    conditions.push(mediaCondition);
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

function getSlowPathOrderSql(
  sortField: Prisma.BookmarkScalarFieldEnum | "likes" | "retweets" | "replies" | "performance" | "tweetCreatedAt" | "authorUsername" | "bookmarkedAt"
) {
  switch (sortField) {
    case "likes":
      return Prisma.sql`COALESCE((b."publicMetrics"->>'like_count')::int, 0)`;
    case "retweets":
      return Prisma.sql`COALESCE((b."publicMetrics"->>'retweet_count')::int, 0)`;
    case "replies":
      return Prisma.sql`COALESCE((b."publicMetrics"->>'reply_count')::int, 0)`;
    case "performance":
      // Log-scaled weighted engagement score (official X public_metrics).
      // Used for "Library Highlights" on collections page and any performance-sorted views.
      // Higher weights on bookmark_count (strongest signal) and replies.
      return Prisma.sql`(
        1.0 * LN(1 + COALESCE((b."publicMetrics"->>'like_count')::int, 0)) +
        2.0 * LN(1 + COALESCE((b."publicMetrics"->>'retweet_count')::int, 0)) +
        3.5 * LN(1 + COALESCE((b."publicMetrics"->>'reply_count')::int, 0)) +
        2.0 * LN(1 + COALESCE((b."publicMetrics"->>'quote_count')::int, 0)) +
        6.0 * LN(1 + COALESCE((b."publicMetrics"->>'bookmark_count')::int, 0))
      )`;
    case "tweetCreatedAt":
      return Prisma.sql`b."tweetCreatedAt"`;
    case "authorUsername":
      return Prisma.sql`b."authorUsername"`;
    default:
      return Prisma.sql`b."bookmarkedAt"`;
  }
}

export async function GET(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = bookmarksQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const {
    page,
    limit,
    search,
    sortField,
    sortDirection,
    mediaFilter,
    authorFilter,
    tagFilter,
    dateFrom,
    dateTo,
    bookmarkId,
    collectionId,
    unaffiliated,
    raw,
    personalBoost,
  } = parsed.data;

  const tagIds = tagFilter
    ? tagFilter.split(",").map((id) => id.trim()).filter(Boolean)
    : [];
  const searchTerms = tokenizeBookmarkSearch(search);

  // Phase 2 item 7: lightweight personal signals (simple overlap query over organized bookmarks)
  // Only runs for Highlights performance calls when ?personalBoost=1 (cheap, LIMIT 8, no heavy ranking).
  // Provides frequency-weighted authors from items the user has already curated (tagged or saved to a personal collection).
  let personalBoostAuthors: string[] = [];
  const personalBoostTags: string[] = [];
  // Only compute for the intended cheap Highlights path (performance sort + small limit).
  // This makes the "lightweight only on Highlights" contract explicit and defensive.
  if (personalBoost && limit <= 4 && sortField === "performance") {
    const orgAuthorRows = await prisma.$queryRaw<
      { author: string; c: bigint }[]
    >`
      SELECT b."authorUsername" AS author, COUNT(*)::bigint AS c
      FROM "Bookmark" b
      WHERE b."userId" = ${user.id}
        AND (
          EXISTS (SELECT 1 FROM "BookmarkTag" bt WHERE bt."bookmarkId" = b."id")
          OR EXISTS (
            SELECT 1 FROM "CollectionItem" ci
            INNER JOIN "Collection" c ON c."id" = ci."collectionId"
            WHERE ci."bookmarkId" = b."id" AND c."type" = 'user_collection'
          )
        )
      GROUP BY b."authorUsername"
      ORDER BY c DESC
      LIMIT 8
    `;
    personalBoostAuthors = orgAuthorRows.map((r) => r.author);
    // personalBoostTags left as [] for API response symmetry with the hook's merge logic.
    // Future: server-side tag frequency aggregation could populate it (client currently derives strong tags).
  }

  const where: Prisma.BookmarkWhereInput = { userId: user.id };
  const relationFilters: Prisma.BookmarkWhereInput[] = [];

  for (const term of searchTerms) {
    relationFilters.push({
      OR: [
        { tweetText: { contains: term, mode: "insensitive" } },
        { authorUsername: { contains: term, mode: "insensitive" } },
        { authorDisplayName: { contains: term, mode: "insensitive" } },
        { notes: { some: { content: { contains: term, mode: "insensitive" } } } },
      ],
    });
  }

  if (authorFilter) {
    where.authorUsername = { contains: authorFilter, mode: "insensitive" };
  }

  if (tagIds.length > 0) {
    relationFilters.push({ tags: { some: { tagId: { in: tagIds } } } });
  }

  if (dateFrom || dateTo) {
    where.tweetCreatedAt = {};
    if (dateFrom) where.tweetCreatedAt.gte = getDateStart(dateFrom);
    if (dateTo) where.tweetCreatedAt.lt = getNextDateStart(dateTo);
  }

  if (bookmarkId) {
    where.id = bookmarkId;
  }

  if (collectionId) {
    relationFilters.push({ collectionItems: { some: { collectionId } } });
  }

  applyAdvancedFilters({ relationFilters, unaffiliated, raw });

  if (relationFilters.length > 0) {
    where.AND = relationFilters;
  }

  if (mediaFilter === "links") {
    where.urls = { not: Prisma.JsonNull };
  } else if (mediaFilter === "text-only") {
    where.media = { equals: Prisma.JsonNull };
    where.urls = { equals: Prisma.JsonNull };
  }

  const needsSlowPath =
    sortField === "likes" ||
    sortField === "retweets" ||
    sortField === "replies" ||
    sortField === "performance" ||
    mediaFilter !== "all";

  // Advanced filters (unaffiliated, raw, future personalization, etc.) are now centralized
  // in `applyAdvancedFilters`. Both fast and slow paths call it.
  // This significantly reduces the previous duplication/brittleness.

  if (!needsSlowPath) {
    let orderBy: Prisma.BookmarkOrderByWithRelationInput;
    switch (sortField) {
      case "tweetCreatedAt":
        orderBy = { tweetCreatedAt: sortDirection };
        break;
      case "authorUsername":
        orderBy = { authorUsername: sortDirection };
        break;
      default:
        orderBy = { bookmarkedAt: sortDirection };
    }

    const [bookmarks, total] = await Promise.all([
      prisma.bookmark.findMany({
        where,
        include: bookmarkInclude,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.bookmark.count({ where }),
    ]);

    return NextResponse.json({
      bookmarks,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      ...(personalBoost && (personalBoostAuthors.length || personalBoostTags.length)
        ? { personalBoostAuthors, personalBoostTags }
        : {}),
    });
  }

  const slowWhereSql = buildSlowPathWhereSql({
    userId: user.id,
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
  });
  const orderSql = getSlowPathOrderSql(sortField);
  const directionSql = Prisma.raw(sortDirection.toUpperCase());

  const [pageRows, totalRows] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT b."id"
      FROM "Bookmark" b
      ${slowWhereSql}
      ORDER BY ${orderSql} ${directionSql}, b."id" ${directionSql}
      OFFSET ${(page - 1) * limit}
      LIMIT ${limit}
    `),
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "Bookmark" b
      ${slowWhereSql}
    `),
  ]);

  const pageIds = pageRows.map((row) => row.id);
  const total = Number(totalRows[0]?.count ?? 0);

  const bookmarks =
    pageIds.length === 0
      ? []
      : await prisma.bookmark.findMany({
          where: { id: { in: pageIds } },
          include: bookmarkInclude,
        });

  const order = new Map(pageIds.map((id, i) => [id, i]));
  bookmarks.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return NextResponse.json({
    bookmarks,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
    ...(personalBoost && (personalBoostAuthors.length || personalBoostTags.length)
      ? { personalBoostAuthors, personalBoostTags }
      : {}),
  });
}

export async function DELETE(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit bookmark deletions
  const rateLimitResult = await checkRateLimit("api:write", user.id);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }

  const body = await req.json().catch(() => ({}));
  const parsed = deleteBookmarkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const bookmarkIds = parsed.data.bookmarkIds ?? [parsed.data.bookmarkId!];

  const bookmarks = await prisma.bookmark.findMany({
    where: { id: { in: bookmarkIds }, userId: user.id },
    select: { id: true, tweetId: true },
  });

  if (bookmarks.length !== bookmarkIds.length) {
    return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.hiddenBookmark.createMany({
      data: bookmarks.map((bookmark) => ({
        userId: user.id,
        tweetId: bookmark.tweetId,
      })),
      skipDuplicates: true,
    }),
    prisma.bookmark.deleteMany({
      where: { id: { in: bookmarkIds }, userId: user.id },
    }),
  ]);

  return NextResponse.json({ success: true, hiddenCount: bookmarkIds.length });
}
