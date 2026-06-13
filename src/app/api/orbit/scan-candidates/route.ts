import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getDbUser } from "@/lib/auth";
import {
  buildBookmarkSearchTermSql,
  tokenizeBookmarkSearch,
} from "@/lib/bookmark-search";
import { ORBIT_SCAN_CANDIDATE_POOL_SIZE } from "@/lib/orbit-config";
import { prisma } from "@/lib/prisma";
import {
  MAX_BOOKMARK_QUERY_LENGTH,
  MAX_BOOKMARK_QUERY_PAGE,
} from "@/lib/validations";

const scanCandidatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(MAX_BOOKMARK_QUERY_PAGE).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ORBIT_SCAN_CANDIDATE_POOL_SIZE)
    .default(ORBIT_SCAN_CANDIDATE_POOL_SIZE),
  search: z.string().trim().max(MAX_BOOKMARK_QUERY_LENGTH).default(""),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

const scanCandidateInclude = {
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
  notes: { select: { id: true, content: true } },
  collectionItems: {
    select: { collection: { select: { id: true, name: true } } },
  },
} as const;

function buildScanCandidateBaseSql(userId: string, searchTerms: string[]) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`b."userId" = ${userId}`,
    Prisma.sql`NOT EXISTS (SELECT 1 FROM "BookmarkTag" bt WHERE bt."bookmarkId" = b."id")`,
    Prisma.sql`
      NOT EXISTS (
        SELECT 1 FROM "CollectionItem" ci
        INNER JOIN "Collection" c ON c."id" = ci."collectionId"
        WHERE ci."bookmarkId" = b."id" AND c."type" = 'user_collection'
      )
    `,
  ];

  for (const term of searchTerms) {
    conditions.push(buildBookmarkSearchTermSql(term));
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

export async function GET(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = scanCandidatesQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { page, pageSize, limit, search, sortDirection } = parsed.data;
  const searchTerms = tokenizeBookmarkSearch(search);

  if (searchTerms.length > 0) {
    const whereSql = buildScanCandidateBaseSql(user.id, searchTerms);
    const directionSql = Prisma.raw(sortDirection.toUpperCase());

    const pageRows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT b."id"
      FROM "Bookmark" b
      ${whereSql}
      ORDER BY b."bookmarkedAt" ${directionSql}, b."id" ${directionSql}
      OFFSET ${(page - 1) * pageSize}
      LIMIT ${limit}
    `);

    const pageIds = pageRows.map((row) => row.id);
    const bookmarks =
      pageIds.length === 0
        ? []
        : await prisma.bookmark.findMany({
            where: { id: { in: pageIds } },
            include: scanCandidateInclude,
          });

    const order = new Map(pageIds.map((id, index) => [id, index]));
    bookmarks.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    return NextResponse.json({ bookmarks });
  }

  const relationFilters: Prisma.BookmarkWhereInput[] = [
    { tags: { none: {} } },
    {
      collectionItems: {
        none: { collection: { type: "user_collection" } },
      },
    },
  ];

  const where: Prisma.BookmarkWhereInput = {
    userId: user.id,
    AND: relationFilters,
  };

  const bookmarks = await prisma.bookmark.findMany({
    where,
    include: scanCandidateInclude,
    orderBy: { bookmarkedAt: sortDirection },
    skip: (page - 1) * pageSize,
    take: limit,
  });

  return NextResponse.json({ bookmarks });
}
