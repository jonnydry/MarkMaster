import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireCollection(
  collectionId: string,
  userId: string
): Promise<boolean> {
  const col = await prisma.collection.findFirst({
    where: { id: collectionId, userId },
    select: { id: true },
  });
  return col !== null;
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

  if (!(await requireCollection(collectionId, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { bookmarkId } = await req.json();

  const maxOrder = await prisma.collectionItem.findFirst({
    where: { collectionId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const item = await prisma.collectionItem.upsert({
    where: {
      collectionId_bookmarkId: { collectionId, bookmarkId },
    },
    update: {},
    create: {
      collectionId,
      bookmarkId,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });

  return NextResponse.json(item);
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

  if (!(await requireCollection(collectionId, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { bookmarkId } = await req.json();

  await prisma.collectionItem.delete({
    where: {
      collectionId_bookmarkId: { collectionId, bookmarkId },
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

  if (!(await requireCollection(collectionId, user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { items } = await req.json();

  await prisma.$transaction(
    items.map((item: { bookmarkId: string; sortOrder: number }) =>
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
