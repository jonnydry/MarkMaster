import { Prisma } from "@prisma/client";

import { selectBookmarkImageSources } from "@/lib/bookmark-image-sources";
import type {
  ImageBackfillBookmark,
  StoredImageEmbedding,
} from "@/lib/image-embedding-backfill";
import { toPgVectorLiteral } from "@/lib/pg-vector";
import { prisma } from "@/lib/prisma";

export async function listBookmarksForImageEmbedding(): Promise<ImageBackfillBookmark[]> {
  const rows = await prisma.bookmark.findMany({
    orderBy: { id: "asc" },
    select: { id: true, media: true, urls: true },
  });

  return rows.map((row) => ({
    bookmarkId: row.id,
    images: selectBookmarkImageSources(row),
  }));
}

export async function listExistingImageEmbeddings(
  model: string,
  dims: number
): Promise<Array<{ bookmarkId: string; mediaKey: string; contentHash: string }>> {
  return prisma.$queryRaw(Prisma.sql`
    SELECT "bookmarkId", "mediaKey", "contentHash"
    FROM "BookmarkImageEmbedding"
    WHERE "model" = ${model}
      AND "dims" = ${dims}
  `);
}

export async function deleteAbsentImageEmbeddings(
  model: string,
  dims: number,
  keep: Array<{ bookmarkId: string; mediaKey: string }>
): Promise<number> {
  if (keep.length === 0) {
    return prisma.$executeRaw(Prisma.sql`
      DELETE FROM "BookmarkImageEmbedding"
      WHERE "model" = ${model}
        AND "dims" = ${dims}
    `);
  }

  const bookmarkIds = keep.map((row) => row.bookmarkId);
  const mediaKeys = keep.map((row) => row.mediaKey);
  return prisma.$executeRaw(Prisma.sql`
    DELETE FROM "BookmarkImageEmbedding" AS e
    WHERE e."model" = ${model}
      AND e."dims" = ${dims}
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(${bookmarkIds}::text[], ${mediaKeys}::text[]) AS keep("bookmarkId", "mediaKey")
        WHERE keep."bookmarkId" = e."bookmarkId"
          AND keep."mediaKey" = e."mediaKey"
      )
  `);
}

export async function upsertBookmarkImageEmbeddings(rows: StoredImageEmbedding[]): Promise<void> {
  if (rows.length === 0) return;

  const values = rows.map((row) => {
    const literal = toPgVectorLiteral(row.embedding, row.dims);
    return Prisma.sql`(
      ${row.bookmarkId},
      ${row.mediaKey},
      ${row.model},
      ${row.dims},
      ${literal}::vector,
      ${row.contentHash},
      NOW(),
      NOW()
    )`;
  });

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "BookmarkImageEmbedding" (
      "bookmarkId",
      "mediaKey",
      "model",
      "dims",
      "embedding",
      "contentHash",
      "createdAt",
      "updatedAt"
    )
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("bookmarkId", "mediaKey", "model", "dims") DO UPDATE SET
      "embedding" = EXCLUDED."embedding",
      "contentHash" = EXCLUDED."contentHash",
      "updatedAt" = NOW()
  `);
}
