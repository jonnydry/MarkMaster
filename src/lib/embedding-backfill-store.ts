import { Prisma } from "@prisma/client";

import type {
  EmbeddingBackfillBookmark,
  StoredEmbedding,
} from "@/lib/embedding-backfill";
import { toPgVectorLiteral } from "@/lib/pg-vector";
import { prisma } from "@/lib/prisma";

export async function listBookmarksForEmbedding(userId?: string): Promise<EmbeddingBackfillBookmark[]> {
  const rows = await prisma.bookmark.findMany({
    ...(userId ? { where: { userId } } : {}),
    orderBy: { id: "asc" },
    select: {
      id: true,
      tweetText: true,
      authorUsername: true,
      authorDisplayName: true,
      urls: true,
      quotedTweet: true,
      tags: { select: { tag: { select: { name: true } } } },
      notes: { select: { id: true, content: true }, orderBy: { id: "asc" } },
    },
  });

  return rows.map((row) => ({
    bookmarkId: row.id,
    tweetText: row.tweetText,
    authorUsername: row.authorUsername,
    authorDisplayName: row.authorDisplayName,
    urls: row.urls,
    quotedTweet: row.quotedTweet,
    tagNames: row.tags.map((tag) => tag.tag.name),
    note: row.notes.map((note) => note.content.trim()).filter(Boolean).join("\n") || null,
  }));
}

export async function listExistingEmbeddingHashes(
  model: string,
  dims: number,
  userId?: string
): Promise<Array<{ bookmarkId: string; contentHash: string }>> {
  if (!userId) {
    return prisma.$queryRaw<{ bookmarkId: string; contentHash: string }[]>(Prisma.sql`
      SELECT "bookmarkId", "contentHash"
      FROM "BookmarkEmbedding"
      WHERE "model" = ${model}
        AND "dims" = ${dims}
    `);
  }

  return prisma.$queryRaw<{ bookmarkId: string; contentHash: string }[]>(Prisma.sql`
    SELECT e."bookmarkId", e."contentHash"
    FROM "BookmarkEmbedding" AS e
    WHERE e."model" = ${model}
      AND e."dims" = ${dims}
      AND e."bookmarkId" IN (
        SELECT "id" FROM "Bookmark" WHERE "userId" = ${userId}
      )
  `);
}

export async function upsertBookmarkEmbeddings(rows: StoredEmbedding[]): Promise<void> {
  if (rows.length === 0) return;

  const values = rows.map((row) => {
    const literal = toPgVectorLiteral(row.embedding, row.dims);
    return Prisma.sql`(
      ${row.bookmarkId},
      ${row.model},
      ${row.dims},
      ${literal}::vector,
      ${row.contentHash},
      NOW(),
      NOW()
    )`;
  });

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "BookmarkEmbedding" (
      "bookmarkId",
      "model",
      "dims",
      "embedding",
      "contentHash",
      "createdAt",
      "updatedAt"
    )
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("bookmarkId", "model", "dims") DO UPDATE SET
      "embedding" = EXCLUDED."embedding",
      "contentHash" = EXCLUDED."contentHash",
      "updatedAt" = NOW()
  `);
}
