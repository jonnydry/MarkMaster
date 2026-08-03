import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";
import {
  addCollectionItemSchema,
  deleteCollectionItemSchema,
  updateCollectionItemsOrderSchema,
} from "@/lib/validations";
import { invalidateUserResponseCache } from "@/lib/upstash-cache";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";

async function requireCollection(
  collectionId: string,
  userId: string
): Promise<{ id: string; type: string } | null> {
  return prisma.collection.findFirst({
    where: { id: collectionId, userId },
    select: { id: true, type: true },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: collectionId } = await params;
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit("api:write", user.id);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }

  const collection = await requireCollection(collectionId, user.id);
  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (collection.type === "x_folder") {
    return NextResponse.json(
      { error: "This collection is synced from X and cannot be edited." },
      { status: 403 }
    );
  }

  const body = await readJsonBody(req);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  const parsed = addCollectionItemSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const bookmarkIds = parsed.data.bookmarkIds ?? [parsed.data.bookmarkId!];

  const bookmarks = await prisma.bookmark.findMany({
    where: { id: { in: bookmarkIds }, userId: user.id },
    select: { id: true },
  });
  if (bookmarks.length !== bookmarkIds.length) {
    return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const maxOrder = await tx.collectionItem.findFirst({
      where: { collectionId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const baseOrder = (maxOrder?.sortOrder ?? -1) + 1;

    if (bookmarkIds.length === 1) {
      const item = await tx.collectionItem.upsert({
        where: {
          collectionId_bookmarkId: { collectionId, bookmarkId: bookmarkIds[0] },
        },
        update: {},
        create: {
          collectionId,
          bookmarkId: bookmarkIds[0],
          sortOrder: baseOrder,
        },
      });

      return item;
    }

    await tx.collectionItem.createMany({
      data: bookmarkIds.map((bid, index) => ({
        collectionId,
        bookmarkId: bid,
        sortOrder: baseOrder + index,
      })),
      skipDuplicates: true,
    });

    return null;
  });

  if (bookmarkIds.length === 1 && result) {
    await invalidateUserResponseCache(user.id);
    return NextResponse.json(result);
  }

  await invalidateUserResponseCache(user.id);

  return NextResponse.json({ success: true, addedCount: bookmarkIds.length });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: collectionId } = await params;
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit("api:write", user.id);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }

  const collection = await requireCollection(collectionId, user.id);
  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (collection.type === "x_folder") {
    return NextResponse.json(
      { error: "This collection is synced from X and cannot be edited." },
      { status: 403 }
    );
  }

  const body = await readJsonBody(req);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  const parsed = deleteCollectionItemSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const bookmarkIds = parsed.data.bookmarkIds ?? [parsed.data.bookmarkId!];

  await prisma.collectionItem.deleteMany({
    where: {
      collectionId,
      bookmarkId: { in: bookmarkIds },
    },
  });

  await invalidateUserResponseCache(user.id);

  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: collectionId } = await params;
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit("api:write", user.id);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }

  const collection = await requireCollection(collectionId, user.id);
  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (collection.type === "x_folder") {
    return NextResponse.json(
      { error: "This collection is synced from X and cannot be edited." },
      { status: 403 }
    );
  }

  const body = await readJsonBody(req);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  const parsed = updateCollectionItemsOrderSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const orderUpdate = parsed.data;

  if ("direction" in orderUpdate) {
    const { bookmarkId, direction } = orderUpdate;
    const moveResult = await prisma.$transaction(async (tx) => {
      const current = await tx.collectionItem.findUnique({
        where: {
          collectionId_bookmarkId: {
            collectionId,
            bookmarkId,
          },
        },
        select: { id: true, sortOrder: true },
      });
      if (!current) return { moved: false, missing: true } as const;

      const movingUp = direction === "up";
      const neighbor = await tx.collectionItem.findFirst({
        where: {
          collectionId,
          OR: movingUp
            ? [
                { sortOrder: { lt: current.sortOrder } },
                { sortOrder: current.sortOrder, id: { lt: current.id } },
              ]
            : [
                { sortOrder: { gt: current.sortOrder } },
                { sortOrder: current.sortOrder, id: { gt: current.id } },
              ],
        },
        orderBy: movingUp
          ? [{ sortOrder: "desc" }, { id: "desc" }]
          : [{ sortOrder: "asc" }, { id: "asc" }],
        select: { id: true, sortOrder: true },
      });
      if (!neighbor) return { moved: false, missing: false } as const;

      await Promise.all([
        tx.collectionItem.update({
          where: { id: current.id },
          data: { sortOrder: neighbor.sortOrder },
        }),
        tx.collectionItem.update({
          where: { id: neighbor.id },
          data: { sortOrder: current.sortOrder },
        }),
      ]);

      return { moved: true, missing: false } as const;
    });

    if (moveResult.missing) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }

    await invalidateUserResponseCache(user.id);
    return NextResponse.json({ success: true, moved: moveResult.moved });
  }

  const reorderItems = orderUpdate.items;
  const reorderResult = await prisma.$transaction(async (tx) => {
    const existingItems = await tx.collectionItem.findMany({
      where: {
        collectionId,
        bookmarkId: { in: reorderItems.map((item) => item.bookmarkId) },
      },
      select: { bookmarkId: true },
    });

    const existingIds = new Set(existingItems.map((item) => item.bookmarkId));
    const missingIds = reorderItems
      .map((item) => item.bookmarkId)
      .filter((id) => !existingIds.has(id));

    if (missingIds.length > 0) {
      return { missingIds } as const;
    }

    // Single bulk UPDATE instead of up to MAX_REORDER_ITEMS individual round-trips.
    // Scoped to collectionId so it can only touch rows already validated above.
    const valueTuples = reorderItems.map(
      (item) => Prisma.sql`(${item.bookmarkId}, ${item.sortOrder}::int)`
    );

    await tx.$executeRaw(Prisma.sql`
      UPDATE "CollectionItem" AS ci
      SET "sortOrder" = v.sort_order
      FROM (VALUES ${Prisma.join(valueTuples)}) AS v(bookmark_id, sort_order)
      WHERE ci."collectionId" = ${collectionId}
        AND ci."bookmarkId" = v.bookmark_id
    `);

    return { missingIds: [] } as const;
  });

  if (reorderResult.missingIds.length > 0) {
    return NextResponse.json(
      {
        error: "Reorder request includes bookmarks that are not in this collection.",
        missingIds: reorderResult.missingIds,
      },
      { status: 400 }
    );
  }

  await invalidateUserResponseCache(user.id);
  return NextResponse.json({ success: true });
}
