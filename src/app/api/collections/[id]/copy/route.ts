import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sourceId } = await params;
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const source = await prisma.collection.findUnique({
    where: { id: sourceId, userId: user.id },
    include: {
      items: {
        include: { bookmark: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!source) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (source.type !== "x_folder") {
    return NextResponse.json(
      { error: "Only X folders can be copied as collections." },
      { status: 400 }
    );
  }

  const existing = await prisma.collection.findFirst({
    where: {
      userId: user.id,
      name: `${source.name} (Copy)`,
      type: "user_collection",
    },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json(
      { error: "A copy of this folder already exists as a collection." },
      { status: 409 }
    );
  }

  const provenance = `Copied from X folder "${source.name}"`;
  const description = source.description
    ? `${provenance}\n\n${source.description}`
    : provenance;

  const newCollection = await prisma.collection.create({
    data: {
      userId: user.id,
      name: `${source.name} (Copy)`,
      description,
      type: "user_collection",
      isPublic: false,
    },
  });

  if (source.items.length > 0) {
    await prisma.collectionItem.createMany({
      data: source.items.map((item, index) => ({
        collectionId: newCollection.id,
        bookmarkId: item.bookmarkId,
        sortOrder: index,
      })),
      skipDuplicates: true,
    });
  }

  const result = await prisma.collection.findUnique({
    where: { id: newCollection.id },
    include: { _count: { select: { items: true } } },
  });

  return NextResponse.json(result, { status: 201 });
}