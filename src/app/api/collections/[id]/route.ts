import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";
import { patchCollectionSchema } from "@/lib/validations";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const collection = await prisma.collection.findUnique({
    where: { id, userId: user.id },
    include: {
      items: {
        include: {
          bookmark: {
            include: {
              tags: { include: { tag: true } },
              notes: { select: { id: true, content: true } },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(collection);
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

  const body = await req.json().catch(() => ({}));
  const parsed = patchCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const existingCollection = await prisma.collection.findUnique({
    where: { id, userId: user.id },
    select: { shareSlug: true, externalSource: true },
  });

  if (!existingCollection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    existingCollection.externalSource &&
    (parsed.data.name !== undefined || parsed.data.description !== undefined)
  ) {
    return NextResponse.json(
      { error: "This collection is managed by sync and cannot be renamed." },
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

  const collection = await prisma.collection.findUnique({
    where: { id, userId: user.id },
    select: { externalSource: true },
  });

  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (collection.externalSource) {
    return NextResponse.json(
      { error: "This collection is managed by sync and cannot be deleted." },
      { status: 403 }
    );
  }

  await prisma.collection.delete({
    where: { id, userId: user.id },
  });

  return NextResponse.json({ success: true });
}
