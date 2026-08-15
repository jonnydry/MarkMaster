import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";
import { bookmarkListQueryOptions } from "@/lib/bookmark-list-query";
import { readJsonBody } from "@/lib/request-body";
import { collectionDetailQuerySchema, patchCollectionSchema } from "@/lib/validations";
import { invalidateUserResponseCache } from "@/lib/upstash-cache";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import {
  buildCollectionItemListNextCursor,
  buildPrismaCollectionItemKeysetFilter,
  decodeCollectionItemListCursor,
} from "@/lib/collection-item-keyset";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedQuery = collectionDetailQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries())
  );
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsedQuery.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { page, limit, cursor: rawCursor, q, sort } = parsedQuery.data;
  const search = q?.trim() || null;
  const keysetEligible = sort === "custom" && !search;

  if (rawCursor && !keysetEligible) {
    return NextResponse.json(
      { error: "Cursor pagination is only available for custom order." },
      { status: 400 }
    );
  }

  const decodedCursor = rawCursor ? decodeCollectionItemListCursor(rawCursor) : null;
  if (rawCursor && !decodedCursor) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  const useKeyset = Boolean(decodedCursor);
  const useOffset = !useKeyset && page > 1;

  const collection = await prisma.collection.findUnique({
    where: { id, userId: user.id },
    select: {
      id: true,
      name: true,
      description: true,
      type: true,
      isPublic: true,
      shareSlug: true,
      externalSource: true,
      externalSourceId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const baseItemWhere: Prisma.CollectionItemWhereInput = {
    collectionId: id,
    ...(search
      ? {
          bookmark: {
            OR: [
              { tweetText: { contains: search, mode: "insensitive" } },
              { authorUsername: { contains: search, mode: "insensitive" } },
              { authorDisplayName: { contains: search, mode: "insensitive" } },
              { notes: { some: { content: { contains: search, mode: "insensitive" } } } },
              { tags: { some: { tag: { name: { contains: search, mode: "insensitive" } } } } },
            ],
          },
        }
      : {}),
  };
  const itemWhere: Prisma.CollectionItemWhereInput = {
    ...baseItemWhere,
    ...(decodedCursor
      ? buildPrismaCollectionItemKeysetFilter(decodedCursor)
      : {}),
  };
  const itemOrderBy: Prisma.CollectionItemOrderByWithRelationInput[] =
    sort === "newest"
      ? [{ bookmark: { bookmarkedAt: "desc" } }, { id: "desc" }]
      : sort === "oldest"
        ? [{ bookmark: { bookmarkedAt: "asc" } }, { id: "asc" }]
        : [{ sortOrder: "asc" }, { id: "asc" }];

  const [items, total] = await Promise.all([
    prisma.collectionItem.findMany({
      where: itemWhere,
      select: {
        id: true,
        sortOrder: true,
        bookmark: bookmarkListQueryOptions({ compact: true }),
      },
      orderBy: itemOrderBy,
      ...(useKeyset || !useOffset ? {} : { skip: (page - 1) * limit }),
      take: limit,
    }),
    prisma.collectionItem.count({ where: baseItemWhere }),
  ]);

  const nextCursor = keysetEligible
    ? buildCollectionItemListNextCursor(items, limit)
    : undefined;

  return NextResponse.json(
    {
      ...collection,
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      nextCursor,
    },
    {
      headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" },
    }
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit("api:write", user.id);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }

  const body = await readJsonBody(req);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  const parsed = patchCollectionSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const existingCollection = await prisma.collection.findUnique({
    where: { id, userId: user.id },
    select: { shareSlug: true, type: true },
  });

  if (!existingCollection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    existingCollection.type === "x_folder" &&
    (parsed.data.name !== undefined || parsed.data.description !== undefined)
  ) {
    return NextResponse.json(
      { error: "This collection is synced from X and cannot be renamed." },
      { status: 403 }
    );
  }

  const updateData: Record<string, unknown> = {};

  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.isPublic !== undefined) {
    updateData.isPublic = parsed.data.isPublic;
    if (parsed.data.isPublic) {
      if (!existingCollection.shareSlug) {
        updateData.shareSlug = nanoid(10);
      }
    } else {
      updateData.shareSlug = null;
    }
  }

  const collection = await prisma.collection.update({
    where: { id, userId: user.id },
    data: updateData,
  });

  await invalidateUserResponseCache(user.id);

  return NextResponse.json(collection);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit("api:write", user.id);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }

  const collection = await prisma.collection.findUnique({
    where: { id, userId: user.id },
    select: { type: true },
  });

  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (collection.type === "x_folder") {
    return NextResponse.json(
      { error: "This collection is synced from X and cannot be deleted." },
      { status: 403 }
    );
  }

  await prisma.collection.delete({
    where: { id, userId: user.id },
  });

  await invalidateUserResponseCache(user.id);

  return NextResponse.json({ success: true });
}
