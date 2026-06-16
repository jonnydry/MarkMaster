import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  buildBookmarkListNextCursor,
  buildPrismaBookmarkKeysetFilter,
  cursorMatchesRequest,
  decodeBookmarkListCursor,
  type BookmarkSortField,
} from "@/lib/bookmark-keyset";
import {
  applyAdvancedBookmarkFilters,
  buildSlowPathWhereSql,
  getDateStart,
  getNextDateStart,
  getSlowPathOrderSql,
} from "@/lib/bookmark-list-filters";
import { tokenizeBookmarkSearch } from "@/lib/bookmark-search";
import { bookmarkListQueryOptions } from "@/lib/bookmark-list-query";
import { readJsonBody } from "@/lib/request-body";
import { invalidateUserResponseCache } from "@/lib/upstash-cache";
import { bookmarksQuerySchema, deleteBookmarkSchema } from "@/lib/validations";

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
    cursor: rawCursor,
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

  const listSortField = sortField as BookmarkSortField;
  const decodedCursor = rawCursor ? decodeBookmarkListCursor(rawCursor) : null;
  if (rawCursor && !decodedCursor) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }
  if (
    decodedCursor &&
    !cursorMatchesRequest(decodedCursor, listSortField, sortDirection)
  ) {
    return NextResponse.json(
      { error: "Cursor does not match the current sort order." },
      { status: 400 }
    );
  }

  const useKeyset = Boolean(decodedCursor);
  const offset =
    useKeyset || page <= 1 ? 0 : (page - 1) * limit;

  const tagIds = tagFilter
    ? tagFilter.split(",").map((id) => id.trim()).filter(Boolean)
    : [];
  const searchTerms = tokenizeBookmarkSearch(search);
  const hasTextSearch = searchTerms.length > 0 || Boolean(authorFilter);

  let personalBoostAuthors: string[] = [];
  const personalBoostTags: string[] = [];
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
  }

  const where: Prisma.BookmarkWhereInput = { userId: user.id };
  const relationFilters: Prisma.BookmarkWhereInput[] = [];

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

  applyAdvancedBookmarkFilters({ relationFilters, unaffiliated, raw });

  if (relationFilters.length > 0) {
    where.AND = relationFilters;
  }

  if (decodedCursor) {
    relationFilters.push(buildPrismaBookmarkKeysetFilter(decodedCursor));
    where.AND = relationFilters;
  }

  if (mediaFilter === "links") {
    where.urls = { not: Prisma.JsonNull };
  } else if (mediaFilter === "text-only") {
    where.media = { equals: Prisma.JsonNull };
    where.urls = { equals: Prisma.JsonNull };
  }

  const needsSlowPath =
    hasTextSearch ||
    sortField === "likes" ||
    sortField === "retweets" ||
    sortField === "replies" ||
    sortField === "performance" ||
    mediaFilter !== "all";

  if (!needsSlowPath) {
    const listQuery = bookmarkListQueryOptions({
      includeDetailFields: Boolean(bookmarkId),
    });

    const [bookmarks, total] = await Promise.all([
      prisma.bookmark.findMany({
        where,
        ...listQuery,
        orderBy:
          sortField === "tweetCreatedAt"
            ? [{ tweetCreatedAt: sortDirection }, { id: sortDirection }]
            : sortField === "authorUsername"
              ? [{ authorUsername: sortDirection }, { id: sortDirection }]
              : [{ bookmarkedAt: sortDirection }, { id: sortDirection }],
        ...(useKeyset ? { take: limit } : { skip: offset, take: limit }),
      }),
      prisma.bookmark.count({ where }),
    ]);

    const nextCursor = buildBookmarkListNextCursor(
      bookmarks,
      listSortField,
      sortDirection,
      limit
    );

    return NextResponse.json({
      bookmarks,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      ...(nextCursor ? { nextCursor } : {}),
      ...(personalBoost && (personalBoostAuthors.length || personalBoostTags.length)
        ? { personalBoostAuthors, personalBoostTags }
        : {}),
    }, { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" } });
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
    keysetCursor: decodedCursor,
  });
  const orderSql = getSlowPathOrderSql(listSortField);
  const directionSql = Prisma.raw(sortDirection.toUpperCase());
  const paginationSql = useKeyset
    ? Prisma.sql`LIMIT ${limit}`
    : Prisma.sql`OFFSET ${offset} LIMIT ${limit}`;

  const [pageRows, totalRows] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT b."id"
      FROM "Bookmark" b
      ${slowWhereSql}
      ORDER BY ${orderSql} ${directionSql}, b."id" ${directionSql}
      ${paginationSql}
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
          ...bookmarkListQueryOptions({ includeDetailFields: Boolean(bookmarkId) }),
        });

  const order = new Map(pageIds.map((id, i) => [id, i]));
  bookmarks.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const nextCursor = buildBookmarkListNextCursor(
    bookmarks,
    listSortField,
    sortDirection,
    limit
  );

  return NextResponse.json({
    bookmarks,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
    ...(nextCursor ? { nextCursor } : {}),
    ...(personalBoost && (personalBoostAuthors.length || personalBoostTags.length)
      ? { personalBoostAuthors, personalBoostTags }
      : {}),
  }, { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" } });
}

export async function DELETE(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(req);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  const parsed = deleteBookmarkSchema.safeParse(body.data);
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

  await invalidateUserResponseCache(user.id);

  return NextResponse.json({ success: true, hiddenCount: bookmarkIds.length });
}
