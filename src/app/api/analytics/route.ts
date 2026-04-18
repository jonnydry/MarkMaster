import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildMediaBreakdown } from "@/lib/analytics";

export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    authorRows,
    monthRows,
    dayRows,
    tags,
    collections,
    mediaCountsRows,
    untaggedRows,
    notedRows,
    velocityRows,
  ] = await Promise.all([
    prisma.$queryRaw<
      {
        author: string;
        displayName: string | null;
        profileImage: string | null;
        verified: boolean;
        count: bigint;
      }[]
    >`
      SELECT
        "authorUsername" AS author,
        MAX("authorDisplayName") AS "displayName",
        MAX("authorProfileImage") AS "profileImage",
        BOOL_OR("authorVerified") AS verified,
        COUNT(*)::bigint AS count
      FROM "Bookmark"
      WHERE "userId" = ${user.id}
      GROUP BY "authorUsername"
      ORDER BY count DESC
      LIMIT 10
    `,
    prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT to_char("bookmarkedAt", 'YYYY-MM') as month, COUNT(*)::bigint as count
      FROM "Bookmark"
      WHERE "userId" = ${user.id}
      GROUP BY month
      ORDER BY month ASC
    `,
    prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT to_char("bookmarkedAt", 'YYYY-MM-DD') as day, COUNT(*)::bigint as count
      FROM "Bookmark"
      WHERE "userId" = ${user.id}
        AND "bookmarkedAt" >= NOW() - INTERVAL '180 days'
      GROUP BY day
      ORDER BY day ASC
    `,
    prisma.tag.findMany({
      where: { userId: user.id },
      include: { _count: { select: { bookmarks: true } } },
    }),
    prisma.collection.count({ where: { userId: user.id } }),
    prisma.$queryRaw<
      {
        totalBookmarks: bigint;
        mediaOnly: bigint;
        mediaAndLinks: bigint;
        linksOnly: bigint;
        textOnly: bigint;
      }[]
    >`
      SELECT
        COUNT(*)::bigint AS "totalBookmarks",
        COUNT(*) FILTER (
          WHERE media_count > 0 AND links_count = 0
        )::bigint AS "mediaOnly",
        COUNT(*) FILTER (
          WHERE media_count > 0 AND links_count > 0
        )::bigint AS "mediaAndLinks",
        COUNT(*) FILTER (
          WHERE media_count = 0 AND links_count > 0
        )::bigint AS "linksOnly",
        COUNT(*) FILTER (
          WHERE media_count = 0 AND links_count = 0
        )::bigint AS "textOnly"
      FROM (
        SELECT
          CASE
            WHEN jsonb_typeof("media") = 'array' THEN jsonb_array_length("media")
            ELSE 0
          END AS media_count,
          CASE
            WHEN jsonb_typeof("urls") = 'array' THEN jsonb_array_length("urls")
            ELSE 0
          END AS links_count
        FROM "Bookmark"
        WHERE "userId" = ${user.id}
      ) bookmark_stats
    `,
    prisma.$queryRaw<{ untaggedCount: bigint; oldestAt: Date | null }[]>`
      SELECT
        COUNT(*)::bigint AS "untaggedCount",
        MIN("bookmarkedAt") AS "oldestAt"
      FROM "Bookmark" b
      WHERE b."userId" = ${user.id}
        AND NOT EXISTS (
          SELECT 1 FROM "BookmarkTag" bt WHERE bt."bookmarkId" = b.id
        )
    `,
    prisma.$queryRaw<{ notedCount: bigint }[]>`
      SELECT COUNT(DISTINCT n."bookmarkId")::bigint AS "notedCount"
      FROM "Note" n
      WHERE n."userId" = ${user.id}
    `,
    prisma.$queryRaw<{ last30d: bigint; previous30d: bigint }[]>`
      SELECT
        COUNT(*) FILTER (WHERE "bookmarkedAt" >= NOW() - INTERVAL '30 days')::bigint AS "last30d",
        COUNT(*) FILTER (
          WHERE "bookmarkedAt" >= NOW() - INTERVAL '60 days'
            AND "bookmarkedAt" < NOW() - INTERVAL '30 days'
        )::bigint AS "previous30d"
      FROM "Bookmark"
      WHERE "userId" = ${user.id}
    `,
  ]);

  const mediaCounts = mediaCountsRows[0] ?? {
    totalBookmarks: BigInt(0),
    mediaOnly: BigInt(0),
    mediaAndLinks: BigInt(0),
    linksOnly: BigInt(0),
    textOnly: BigInt(0),
  };

  const totalBookmarks = Number(mediaCounts.totalBookmarks);

  const topAuthors = authorRows.map((r) => ({
    author: r.author,
    displayName: r.displayName,
    profileImage: r.profileImage,
    verified: Boolean(r.verified),
    count: Number(r.count),
  }));

  const bookmarksByMonth = monthRows.map((r) => ({
    month: r.month,
    count: Number(r.count),
  }));

  const bookmarksByDay = dayRows.map((r) => ({
    day: r.day,
    count: Number(r.count),
  }));

  const tagDistribution = tags
    .map((t) => ({
      id: t.id,
      tag: t.name,
      color: t.color,
      count: t._count.bookmarks,
    }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);

  const untagged = untaggedRows[0] ?? { untaggedCount: BigInt(0), oldestAt: null };
  const noted = notedRows[0] ?? { notedCount: BigInt(0) };
  const velocity = velocityRows[0] ?? { last30d: BigInt(0), previous30d: BigInt(0) };

  return NextResponse.json({
    topAuthors,
    mediaBreakdown: buildMediaBreakdown({
      totalBookmarks,
      mediaOnly: Number(mediaCounts.mediaOnly),
      mediaAndLinks: Number(mediaCounts.mediaAndLinks),
      linksOnly: Number(mediaCounts.linksOnly),
      textOnly: Number(mediaCounts.textOnly),
    }),
    tagDistribution,
    bookmarksByMonth,
    bookmarksByDay,
    totalBookmarks,
    totalTags: tags.length,
    totalCollections: collections,
    untaggedCount: Number(untagged.untaggedCount),
    untaggedOldestAt: untagged.oldestAt ? untagged.oldestAt.toISOString() : null,
    notedCount: Number(noted.notedCount),
    last30dCount: Number(velocity.last30d),
    previous30dCount: Number(velocity.previous30d),
  });
}
