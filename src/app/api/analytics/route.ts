import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [bookmarks, tags, collections] = await Promise.all([
    prisma.bookmark.findMany({
      where: { userId: user.id },
      select: {
        authorUsername: true,
        authorDisplayName: true,
        media: true,
        urls: true,
        tweetCreatedAt: true,
        bookmarkedAt: true,
        tags: { include: { tag: true } },
      },
    }),
    prisma.tag.findMany({
      where: { userId: user.id },
      include: { _count: { select: { bookmarks: true } } },
    }),
    prisma.collection.count({ where: { userId: user.id } }),
  ]);

  const authorCounts = new Map<string, number>();
  const monthCounts = new Map<string, number>();
  let hasMedia = 0;
  let hasLinks = 0;
  let textOnly = 0;

  for (const b of bookmarks) {
    const key = `@${b.authorUsername}`;
    authorCounts.set(key, (authorCounts.get(key) || 0) + 1);

    const month = b.bookmarkedAt.toISOString().slice(0, 7);
    monthCounts.set(month, (monthCounts.get(month) || 0) + 1);

    const mediaArr = b.media as unknown[] | null;
    const urlArr = b.urls as unknown[] | null;
    if (mediaArr && Array.isArray(mediaArr) && mediaArr.length > 0) hasMedia++;
    else if (urlArr && Array.isArray(urlArr) && urlArr.length > 0) hasLinks++;
    else textOnly++;
  }

  const topAuthors = [...authorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([author, count]) => ({ author, count }));

  const bookmarksByMonth = [...monthCounts.entries()]
    .sort()
    .map(([month, count]) => ({ month, count }));

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
      { type: "Media", count: hasMedia },
      { type: "Links", count: hasLinks },
      { type: "Text Only", count: textOnly },
    ],
    tagDistribution,
    bookmarksByMonth,
    totalBookmarks: bookmarks.length,
    totalTags: tags.length,
    totalCollections: collections,
  });
}
