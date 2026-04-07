import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tags = await prisma.tag.findMany({
    where: { userId: user.id },
    include: { _count: { select: { bookmarks: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(tags);
}

export async function POST(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, color, bookmarkId } = await req.json();

  const tag = await prisma.tag.upsert({
    where: { userId_name: { userId: user.id, name } },
    update: { color: color || undefined },
    create: { userId: user.id, name, color: color || "#1d9bf0" },
  });

  if (bookmarkId) {
    await prisma.bookmarkTag.upsert({
      where: { bookmarkId_tagId: { bookmarkId, tagId: tag.id } },
      update: {},
      create: { bookmarkId, tagId: tag.id },
    });
  }

  return NextResponse.json(tag);
}

export async function DELETE(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tagId, bookmarkId } = await req.json();

  if (bookmarkId) {
    await prisma.bookmarkTag.delete({
      where: { bookmarkId_tagId: { bookmarkId, tagId } },
    });
  } else {
    await prisma.tag.delete({
      where: { id: tagId, userId: user.id },
    });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tagId, name, color } = await req.json();

  const tag = await prisma.tag.update({
    where: { id: tagId, userId: user.id },
    data: { name, color },
  });

  return NextResponse.json(tag);
}
