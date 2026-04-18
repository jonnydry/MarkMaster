import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { bookmarksQuerySchema, deleteBookmarkSchema } from "@/lib/validations";

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

function buildSlowPathWhereSql({
  userId,
  search,
  authorFilter,
  tagIds,
  dateFrom,
  dateTo,
  collectionId,
  mediaFilter,
  unaffiliated,
}: {
  userId: string;
  search: string;
  authorFilter: string;
  tagIds: string[];
  dateFrom?: string;
  dateTo?: string;
  collectionId?: string;
  mediaFilter: "all" | "images" | "video" | "links" | "text-only";
  unaffiliated: boolean;
}) {
  const conditions: Prisma.Sql[] = [Prisma.sql`b."userId" = ${userId}`];

  if (search) {
    const searchLike = `%${search}%`;
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

  if (collectionId) {
    conditions.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM "CollectionItem" ci
        WHERE ci."bookmarkId" = b."id" AND ci."collectionId" = ${collectionId}
      )
    `);
  }

  if (unaffiliated) {
    conditions.push(Prisma.sql`
      NOT EXISTS (
        SELECT 1
        FROM "BookmarkTag" bt
        WHERE bt."bookmarkId" = b."id"
      )
    `);
    conditions.push(Prisma.sql`
      NOT EXISTS (
        SELECT 1
        FROM "CollectionItem" ci
        WHERE ci."bookmarkId" = b."id"
      )
    `);
  }

  const mediaCondition = buildMediaFilterCondition(mediaFilter);
  if (mediaCondition) {
    conditions.push(mediaCondition);
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

function getSlowPathOrderSql(
  sortField: Prisma.BookmarkScalarFieldEnum | "likes" | "retweets" | "replies"
) {
  switch (sortField) {
    case "likes":
      return Prisma.sql`COALESCE((b."publicMetrics"->>'like_count')::int, 0)`;
    case "retweets":
      return Prisma.sql`COALESCE((b."publicMetrics"->>'retweet_count')::int, 0)`;
    case "replies":
      return Prisma.sql`COALESCE((b."publicMetrics"->>'reply_count')::int, 0)`;
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
    collectionId,
    unaffiliated,
  } = parsed.data;

  const tagIds = tagFilter ? tagFilter.split(",").filter(Boolean) : [];

  const where: Prisma.BookmarkWhereInput = { userId: user.id };
  const relationFilters: Prisma.BookmarkWhereInput[] = [];

  if (search) {
    where.OR = [
      { tweetText: { contains: search, mode: "insensitive" } },
      { authorUsername: { contains: search, mode: "insensitive" } },
      { authorDisplayName: { contains: search, mode: "insensitive" } },
      { notes: { some: { content: { contains: search, mode: "insensitive" } } } },
    ];
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

  if (collectionId) {
    relationFilters.push({ collectionItems: { some: { collectionId } } });
  }

  if (unaffiliated) {
    relationFilters.push({ tags: { none: {} } });
    relationFilters.push({ collectionItems: { none: {} } });
  }

  if (relationFilters.length > 0) {
    where.AND = relationFilters;
  }

  if (mediaFilter === "links") {
    where.urls = { not: Prisma.JsonNull };
  } else if (mediaFilter === "text-only") {
    where.media = { equals: Prisma.JsonNull };
    where.urls = { equals: Prisma.JsonNull };
  }

  const needsInMemorySort =
    sortField === "likes" ||
    sortField === "retweets" ||
    sortField === "replies";

  const needsInMemoryMedia = mediaFilter === "images" || mediaFilter === "video";

  if (!needsInMemorySort && !needsInMemoryMedia) {
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
    });
  }

  const slowWhereSql = buildSlowPathWhereSql({
    userId: user.id,
    search,
    authorFilter,
    tagIds,
    dateFrom,
    dateTo,
    collectionId,
    mediaFilter,
    unaffiliated,
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
  });
}

export async function DELETE(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
