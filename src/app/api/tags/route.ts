import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTagSchema, deleteTagSchema, patchTagSchema } from "@/lib/validations";

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

  const body = await req.json().catch(() => ({}));
  const parsed = createTagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, color, bookmarkId } = parsed.data;

  if (bookmarkId) {
    const bookmark = await prisma.bookmark.findUnique({
      where: { id: bookmarkId, userId: user.id },
      select: { id: true },
    });
    if (!bookmark) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }
  }

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

  const body = await req.json().catch(() => ({}));
  const parsed = deleteTagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { tagId, bookmarkId } = parsed.data;

  if (bookmarkId) {
    const bookmarkTag = await prisma.bookmarkTag.findFirst({
      where: {
        bookmarkId,
        tagId,
        bookmark: { userId: user.id },
      },
    });
    if (!bookmarkTag) {
      return NextResponse.json({ error: "Tag assignment not found" }, { status: 404 });
    }
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

  const body = await req.json().catch(() => ({}));
  const parsed = patchTagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { tagId, name, color } = parsed.data;

  const tag = await prisma.tag.update({
    where: { id: tagId, userId: user.id },
    data: { name, color },
  });

  return NextResponse.json(tag);
}
