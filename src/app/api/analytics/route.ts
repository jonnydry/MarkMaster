import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildMediaBreakdown } from "@/lib/analytics";

export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [authorRows, monthRows, tags, collections, mediaCountsRows] = await Promise.all([
    prisma.$queryRaw<{ author: string; count: bigint }[]>`
      SELECT "authorUsername" as author, COUNT(*)::bigint as count
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
  ]);

  const mediaCounts = mediaCountsRows[0] || {
    totalBookmarks: BigInt(0),
    mediaOnly: BigInt(0),
    mediaAndLinks: BigInt(0),
    linksOnly: BigInt(0),
    textOnly: BigInt(0),
  };

  const totalBookmarks = Number(mediaCounts.totalBookmarks);

  const topAuthors = authorRows.map((r) => ({
    author: `@${r.author}`,
    count: Number(r.count),
  }));

  const bookmarksByMonth = monthRows.map((r) => ({
    month: r.month,
    count: Number(r.count),
  }));

  const tagDistribution = tags
    .map((t) => ({
      tag: t.name,
      color: t.color,
      count: t._count.bookmarks,
    }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);

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
    totalBookmarks,
    totalTags: tags.length,
    totalCollections: collections,
  });
}
