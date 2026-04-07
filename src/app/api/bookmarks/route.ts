import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { SortField, SortDirection, MediaFilter } from "@/types";

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

  let orderBy: Prisma.BookmarkOrderByWithRelationInput;
  switch (sortField) {
    case "tweetCreatedAt":
      orderBy = { tweetCreatedAt: sortDirection };
      break;
    case "likes":
      orderBy = { publicMetrics: sortDirection };
      break;
    case "retweets":
      orderBy = { publicMetrics: sortDirection };
      break;
    case "replies":
      orderBy = { publicMetrics: sortDirection };
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
      include: {
        tags: { include: { tag: true } },
        notes: { select: { id: true, content: true } },
        collectionItems: {
          include: { collection: { select: { id: true, name: true } } },
        },
      },
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
