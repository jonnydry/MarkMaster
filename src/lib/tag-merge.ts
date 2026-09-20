import "server-only";

import { prisma } from "@/lib/prisma";

export class TagMergeError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "TagMergeError";
    this.status = status;
  }
}

export async function mergeUserTags(args: {
  userId: string;
  sourceTagId: string;
  targetTagId: string;
}): Promise<{
  sourceName: string;
  targetName: string;
  movedBookmarkCount: number;
}> {
  const { userId, sourceTagId, targetTagId } = args;
  if (sourceTagId === targetTagId) {
    throw new TagMergeError("Choose a different tag to merge into.", 400);
  }

  const [source, target] = await Promise.all([
    prisma.tag.findFirst({
      where: { id: sourceTagId, userId },
      select: { id: true, name: true },
    }),
    prisma.tag.findFirst({
      where: { id: targetTagId, userId },
      select: { id: true, name: true },
    }),
  ]);

  if (!source || !target) {
    throw new TagMergeError("Tag not found", 404);
  }

  const movedBookmarkCount = await prisma.$transaction(async (tx) => {
    const sourceLinks = await tx.bookmarkTag.findMany({
      where: { tagId: source.id },
      select: { bookmarkId: true },
    });

    if (sourceLinks.length > 0) {
      await tx.bookmarkTag.createMany({
        data: sourceLinks.map((link) => ({
          bookmarkId: link.bookmarkId,
          tagId: target.id,
        })),
        skipDuplicates: true,
      });
    }

    await tx.tag.delete({ where: { id: source.id } });
    return sourceLinks.length;
  });

  return {
    sourceName: source.name,
    targetName: target.name,
    movedBookmarkCount,
  };
}
