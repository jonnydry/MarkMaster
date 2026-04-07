import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { SortField, SortDirection, MediaFilter } from "@/types";

const bookmarkInclude = {
  tags: { include: { tag: true } },
  notes: { select: { id: true, content: true } },
  collectionItems: {
    include: { collection: { select: { id: true, name: true } } },
  },
} as const;

function hasVideoMedia(media: unknown): boolean {
  if (!Array.isArray(media)) return false;
  return media.some(
    (m) =>
      m &&
      typeof m === "object" &&
      "type" in m &&
      ((m as { type: string }).type === "video" ||
        (m as { type: string }).type === "animated_gif")
  );
}

function metricScore(
  publicMetrics: unknown,
  sortField: "likes" | "retweets" | "replies"
): number {
  const pm = publicMetrics as Record<string, number> | null;
  if (!pm) return 0;
  if (sortField === "likes") return Number(pm.like_count) || 0;
  if (sortField === "retweets") return Number(pm.retweet_count) || 0;
  return Number(pm.reply_count) || 0;
}

export async function GET(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const page = parseInt(params.get("page") || "1");
  const limit = parseInt(params.get("limit") || "20");
  const search = params.get("search") || "";
  const sortField = (params.get("sortField") || "bookmarkedAt") as SortField;
  const sortDirection = (params.get("sortDirection") || "desc") as SortDirection;
  const mediaFilter = (params.get("mediaFilter") || "all") as MediaFilter;
  const authorFilter = params.get("authorFilter") || "";
  const tagFilter = params.get("tagFilter")?.split(",").filter(Boolean) || [];
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const collectionId = params.get("collectionId");

  const where: Prisma.BookmarkWhereInput = { userId: user.id };

  if (search) {
    where.OR = [
      { tweetText: { contains: search, mode: "insensitive" } },
      { authorUsername: { contains: search, mode: "insensitive" } },
      { authorDisplayName: { contains: search, mode: "insensitive" } },
    ];
  }

  if (authorFilter) {
    where.authorUsername = { contains: authorFilter, mode: "insensitive" };
  }

  if (tagFilter.length > 0) {
    where.tags = { some: { tagId: { in: tagFilter } } };
  }

  if (dateFrom || dateTo) {
    where.tweetCreatedAt = {};
    if (dateFrom) where.tweetCreatedAt.gte = new Date(dateFrom);
    if (dateTo) where.tweetCreatedAt.lte = new Date(dateTo);
  }

  if (collectionId) {
    where.collectionItems = { some: { collectionId } };
  }

  if (mediaFilter === "images") {
    where.media = { not: Prisma.JsonNull };
  } else if (mediaFilter === "video") {
    where.media = { not: Prisma.JsonNull };
  } else if (mediaFilter === "links") {
    where.urls = { not: Prisma.JsonNull };
  } else if (mediaFilter === "text-only") {
    where.media = { equals: Prisma.JsonNull };
    where.urls = { equals: Prisma.JsonNull };
  }

  const needsInMemorySort =
    sortField === "likes" ||
    sortField === "retweets" ||
    sortField === "replies";

  const needsInMemoryMedia = mediaFilter === "video";

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
      totalPages: Math.ceil(total / limit),
    });
  }

  const light = await prisma.bookmark.findMany({
    where,
    select: {
      id: true,
      publicMetrics: true,
      bookmarkedAt: true,
      tweetCreatedAt: true,
      authorUsername: true,
      media: true,
    },
  });

  let rows = light;
  if (needsInMemoryMedia) {
    rows = rows.filter((r) => hasVideoMedia(r.media));
  }

  const dir = sortDirection === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "likes":
        cmp =
          metricScore(a.publicMetrics, "likes") -
          metricScore(b.publicMetrics, "likes");
        break;
      case "retweets":
        cmp =
          metricScore(a.publicMetrics, "retweets") -
          metricScore(b.publicMetrics, "retweets");
        break;
      case "replies":
        cmp =
          metricScore(a.publicMetrics, "replies") -
          metricScore(b.publicMetrics, "replies");
        break;
      case "tweetCreatedAt":
        cmp =
          new Date(a.tweetCreatedAt).getTime() -
          new Date(b.tweetCreatedAt).getTime();
        break;
      case "authorUsername":
        cmp = a.authorUsername.localeCompare(b.authorUsername);
        break;
      default:
        cmp =
          new Date(a.bookmarkedAt).getTime() -
          new Date(b.bookmarkedAt).getTime();
        break;
    }
    if (cmp !== 0) return cmp * dir;
    return a.id.localeCompare(b.id) * dir;
  });

  const total = rows.length;
  const pageIds = rows
    .slice((page - 1) * limit, page * limit)
    .map((r) => r.id);

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

  const { bookmarkId } = await req.json();

  await prisma.bookmark.delete({
    where: { id: bookmarkId, userId: user.id },
  });

  return NextResponse.json({ success: true });
}
