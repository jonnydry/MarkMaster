import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  addCollectionItemSchema,
  deleteCollectionItemSchema,
  reorderCollectionItemsSchema,
} from "@/lib/validations";

async function requireCollection(
  collectionId: string,
  userId: string
): Promise<{ id: string; externalSource: string | null } | null> {
  return prisma.collection.findFirst({
    where: { id: collectionId, userId },
    select: { id: true, externalSource: true },
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

  const collection = await requireCollection(collectionId, user.id);
  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (collection.externalSource) {
    return NextResponse.json(
      { error: "This collection is managed by sync and cannot be edited." },
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

  const maxOrder = await prisma.collectionItem.findFirst({
    where: { collectionId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  if (bookmarkIds.length === 1) {
    const item = await prisma.collectionItem.upsert({
      where: {
        collectionId_bookmarkId: { collectionId, bookmarkId: bookmarkIds[0] },
      },
      update: {},
      create: {
        collectionId,
        bookmarkId: bookmarkIds[0],
        sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json(item);
  }

  await prisma.collectionItem.createMany({
    data: bookmarkIds.map((bookmarkId, index) => ({
      collectionId,
      bookmarkId,
      sortOrder: (maxOrder?.sortOrder ?? -1) + index + 1,
    })),
    skipDuplicates: true,
  });

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

  const collection = await requireCollection(collectionId, user.id);
  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (collection.externalSource) {
    return NextResponse.json(
      { error: "This collection is managed by sync and cannot be edited." },
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

  const collection = await requireCollection(collectionId, user.id);
  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (collection.externalSource) {
    return NextResponse.json(
      { error: "This collection is managed by sync and cannot be edited." },
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

  await prisma.$transaction(
    parsed.data.items.map((item) =>
      prisma.collectionItem.update({
        where: {
          collectionId_bookmarkId: {
            collectionId,
            bookmarkId: item.bookmarkId,
          },
        },
        data: { sortOrder: item.sortOrder },
      })
    )
  );

  return NextResponse.json({ success: true });
}
