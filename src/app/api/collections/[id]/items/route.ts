import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  addCollectionItemSchema,
  deleteCollectionItemSchema,
  reorderCollectionItemsSchema,
} from "@/lib/validations";
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

  // Rate limit collection item writes
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

  const body = await req.json().catch(() => ({}));
  const parsed = addCollectionItemSchema.safeParse(body);
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
    return NextResponse.json(result);
  }

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

  // Rate limit collection item writes
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

  const body = await req.json().catch(() => ({}));
  const parsed = deleteCollectionItemSchema.safeParse(body);
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

  // Rate limit collection item writes
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

  const body = await req.json().catch(() => ({}));
  const parsed = reorderCollectionItemsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const reorderResult = await prisma.$transaction(async (tx) => {
    const existingItems = await tx.collectionItem.findMany({
      where: {
        collectionId,
        bookmarkId: { in: parsed.data.items.map((item) => item.bookmarkId) },
      },
      select: { bookmarkId: true },
    });

    const existingIds = new Set(existingItems.map((item) => item.bookmarkId));
    const missingIds = parsed.data.items
      .map((item) => item.bookmarkId)
      .filter((id) => !existingIds.has(id));

    if (missingIds.length > 0) {
      return { missingIds } as const;
    }

    // Single bulk UPDATE instead of up to MAX_REORDER_ITEMS individual round-trips.
    // Scoped to collectionId so it can only touch rows already validated above.
    const valueTuples = parsed.data.items.map(
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

  return NextResponse.json({ success: true });
}
