import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNoteSchema, deleteNoteSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { bookmarkId, content } = parsed.data;

  const bookmark = await prisma.bookmark.findUnique({
    where: { id: bookmarkId, userId: user.id },
    select: { id: true },
  });
  if (!bookmark) {
    return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
  }

  const note = await prisma.note.upsert({
    where: { bookmarkId_userId: { bookmarkId, userId: user.id } },
    update: { content },
    create: { bookmarkId, userId: user.id, content },
  });

  return NextResponse.json(note);
}

export async function DELETE(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = deleteNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  await prisma.note.delete({
    where: { id: parsed.data.noteId, userId: user.id },
  });

  return NextResponse.json({ success: true });
}
