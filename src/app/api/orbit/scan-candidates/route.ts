import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getDbUser } from "@/lib/auth";
import { tokenizeBookmarkSearch } from "@/lib/bookmark-search";
import { ORBIT_SCAN_CANDIDATE_POOL_SIZE } from "@/lib/orbit-config";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
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

export async function GET(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit("api:read", user.id);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
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
  const relationFilters: Prisma.BookmarkWhereInput[] = [
    { tags: { none: {} } },
    {
      collectionItems: {
        none: { collection: { type: "user_collection" } },
      },
    },
  ];

  for (const term of tokenizeBookmarkSearch(search)) {
    relationFilters.push({
      OR: [
        { tweetText: { contains: term, mode: "insensitive" } },
        { authorUsername: { contains: term, mode: "insensitive" } },
        { authorDisplayName: { contains: term, mode: "insensitive" } },
        { notes: { some: { content: { contains: term, mode: "insensitive" } } } },
      ],
    });
  }

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
