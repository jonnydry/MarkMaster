import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const highlightsQuerySchema = z.object({
  raw: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  personalBoost: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  limit: z.coerce.number().int().min(1).max(24).default(4),
  excludeIds: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        : []
    ),
});

const bookmarkInclude = {
  tags: { include: { tag: true } },
  notes: { select: { id: true, content: true } },
  collectionItems: {
    include: { collection: { select: { id: true, name: true } } },
  },
} as const;

const performanceScoreSql = Prisma.sql`(
  1.0 * LN(1 + COALESCE((b."publicMetrics"->>'like_count')::int, 0)) +
  2.0 * LN(1 + COALESCE((b."publicMetrics"->>'retweet_count')::int, 0)) +
  3.5 * LN(1 + COALESCE((b."publicMetrics"->>'reply_count')::int, 0)) +
  2.0 * LN(1 + COALESCE((b."publicMetrics"->>'quote_count')::int, 0)) +
  6.0 * LN(1 + COALESCE((b."publicMetrics"->>'bookmark_count')::int, 0))
)`;

function buildHighlightsWhereSql(
  userId: string,
  raw: boolean,
  excludeIds: string[] = []
) {
  const conditions: Prisma.Sql[] = [Prisma.sql`b."userId" = ${userId}`];

  if (excludeIds.length > 0) {
    conditions.push(
      Prisma.sql`b."id" NOT IN (${Prisma.join(excludeIds.map((id) => Prisma.sql`${id}`))})`
    );
  }

  if (raw) {
    conditions.push(Prisma.sql`
      NOT EXISTS (SELECT 1 FROM "BookmarkTag" bt WHERE bt."bookmarkId" = b."id")
    `);
    conditions.push(Prisma.sql`
      NOT EXISTS (SELECT 1 FROM "CollectionItem" ci WHERE ci."bookmarkId" = b."id")
    `);
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

function getPersonalBoostAuthors(userId: string, enabled: boolean) {
  if (!enabled) return Promise.resolve([] as string[]);

  return prisma.$queryRaw<{ author: string; c: bigint }[]>`
    SELECT b."authorUsername" AS author, COUNT(*)::bigint AS c
    FROM "Bookmark" b
    WHERE b."userId" = ${userId}
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
  `.then((rows) => rows.map((row) => row.author));
}

export async function GET(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = highlightsQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { raw, personalBoost, limit, excludeIds } = parsed.data;
  const whereSql = buildHighlightsWhereSql(user.id, raw, excludeIds);

  const [pageRows, totalRows, personalBoostAuthors] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT b."id"
      FROM "Bookmark" b
      ${whereSql}
      ORDER BY ${performanceScoreSql} DESC, b."id" DESC
      LIMIT ${limit}
    `),
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "Bookmark" b
      ${whereSql}
    `),
    getPersonalBoostAuthors(user.id, personalBoost),
  ]);

  const pageIds = pageRows.map((row) => row.id);
  const bookmarks =
    pageIds.length === 0
      ? []
      : await prisma.bookmark.findMany({
          where: { id: { in: pageIds } },
          include: bookmarkInclude,
        });

  const order = new Map(pageIds.map((id, index) => [id, index]));
  bookmarks.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const total = Number(totalRows[0]?.count ?? 0);

  return NextResponse.json({
    bookmarks,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    ...(personalBoostAuthors.length
      ? { personalBoostAuthors, personalBoostTags: [] }
      : {}),
  }, {
    headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" },
  });
}
