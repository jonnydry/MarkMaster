import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";

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

  const body = await req.json();
  const updateData: Record<string, unknown> = {};

  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.isPublic !== undefined) {
    updateData.isPublic = body.isPublic;
    if (body.isPublic) {
      const existing = await prisma.collection.findUnique({
        where: { id },
        select: { shareSlug: true },
      });
      if (!existing?.shareSlug) {
        updateData.shareSlug = nanoid(10);
      }
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

  await prisma.collection.delete({
    where: { id, userId: user.id },
  });

  return NextResponse.json({ success: true });
}
