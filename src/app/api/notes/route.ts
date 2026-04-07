import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookmarkId, content } = await req.json();

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

  const { noteId } = await req.json();

  await prisma.note.delete({
    where: { id: noteId, userId: user.id },
  });

  return NextResponse.json({ success: true });
}
