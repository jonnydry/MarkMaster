import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

  const { name, color, bookmarkId, bookmarkIds } = parsed.data;
  const targetBookmarkIds = bookmarkIds ?? (bookmarkId ? [bookmarkId] : []);

  if (targetBookmarkIds.length > 0) {
    const bookmarks = await prisma.bookmark.findMany({
      where: { id: { in: targetBookmarkIds }, userId: user.id },
      select: { id: true },
    });
    if (bookmarks.length !== targetBookmarkIds.length) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }
  }

  const tag = await prisma.tag.upsert({
    where: { userId_name: { userId: user.id, name } },
    update: { color: color || undefined },
    create: { userId: user.id, name, color: color || "#1d9bf0" },
  });

  if (targetBookmarkIds.length > 0) {
    await prisma.bookmarkTag.createMany({
      data: targetBookmarkIds.map((id) => ({ bookmarkId: id, tagId: tag.id })),
      skipDuplicates: true,
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

  const { tagId, bookmarkId, bookmarkIds } = parsed.data;
  const targetBookmarkIds = bookmarkIds ?? (bookmarkId ? [bookmarkId] : []);

  if (targetBookmarkIds.length > 0) {
    const bookmarkTags = await prisma.bookmarkTag.findMany({
      where: {
        bookmarkId: { in: targetBookmarkIds },
        tagId,
        bookmark: { userId: user.id },
      },
      select: { bookmarkId: true },
    });
    if (bookmarkTags.length === 0) {
      return NextResponse.json({ error: "Tag assignment not found" }, { status: 404 });
    }
    await prisma.bookmarkTag.deleteMany({
      where: {
        bookmarkId: { in: bookmarkTags.map((bt) => bt.bookmarkId) },
        tagId,
      },
    });
  } else {
    const deleted = await prisma.tag.deleteMany({
      where: { id: tagId, userId: user.id },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }
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

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (color !== undefined) data.color = color;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "At least one field must be provided" }, { status: 400 });
  }

  try {
    const updated = await prisma.tag.updateMany({
      where: { id: tagId, userId: user.id },
      data,
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A tag with that name already exists" },
        { status: 409 }
      );
    }

    throw error;
  }

  const tag = await prisma.tag.findFirst({
    where: { id: tagId, userId: user.id },
  });

  if (!tag) {
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  }

  return NextResponse.json(tag);
}
