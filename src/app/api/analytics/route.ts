import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [authorRows, monthRows, tags, collections] = await Promise.all([
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
  ]);

  const bookmarkMedia = await prisma.bookmark.findMany({
    where: { userId: user.id },
    select: { media: true, urls: true },
  });

  let mediaOnly = 0;
  let linksOnly = 0;
  let mediaAndLinks = 0;
  let textOnly = 0;

  for (const bookmark of bookmarkMedia) {
    const hasMedia = hasItems(bookmark.media);
    const hasLinks = hasItems(bookmark.urls);

    if (hasMedia && hasLinks) mediaAndLinks++;
    else if (hasMedia) mediaOnly++;
    else if (hasLinks) linksOnly++;
    else textOnly++;
  }

  const totalBookmarks = bookmarkMedia.length;

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
    mediaBreakdown: [
      { type: "Media", count: mediaOnly },
      { type: "Media + Links", count: mediaAndLinks },
      { type: "Links", count: linksOnly },
      { type: "Text Only", count: textOnly },
    ],
    tagDistribution,
    bookmarksByMonth,
    totalBookmarks,
    totalTags: tags.length,
    totalCollections: collections,
  });
}
