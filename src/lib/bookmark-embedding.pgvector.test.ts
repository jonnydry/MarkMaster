import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { EMBEDDING_DIMS } from "./embedding-provider";
import { toPgVectorLiteral } from "./pg-vector";

const enabled = process.env.RUN_PGVECTOR_TESTS === "1";

function assertLocalDatabase(url: string | undefined) {
  if (!url) throw new Error("DATABASE_URL is required for the pgvector test");
  const hostname = new URL(url).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error("Refusing pgvector test: DATABASE_URL host is not local");
  }
}

function axis(index: number): number[] {
  return Array.from({ length: EMBEDDING_DIMS }, (_value, position) => (position === index ? 1 : 0));
}

describe.skipIf(!enabled)("bookmark embeddings on local pgvector", () => {
  afterAll(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
  });

  it("stores a 768-d vector, orders by cosine distance, and cascades deletes", async () => {
    assertLocalDatabase(process.env.DATABASE_URL);
    const { prisma } = await import("@/lib/prisma");
    const { upsertBookmarkEmbeddings, listExistingEmbeddingHashes, listBookmarksForEmbedding } =
      await import("@/lib/embedding-backfill-store");

    const userId = `pgv_${randomUUID()}`;
    const nearId = `near_${randomUUID()}`;
    const farId = `far_${randomUUID()}`;

    await prisma.user.create({
      data: {
        id: userId,
        xId: userId,
        username: "pgv",
        displayName: "pgv",
        accessToken: "local-test",
        refreshToken: "local-test",
      },
    });

    try {
      await prisma.bookmark.createMany({
        data: [
          {
            id: nearId,
            userId,
            tweetId: nearId,
            authorId: "author",
            authorUsername: "ada",
            authorDisplayName: "Ada",
            tweetText: "near",
            tweetCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
          {
            id: farId,
            userId,
            tweetId: farId,
            authorId: "author",
            authorUsername: "ada",
            authorDisplayName: "Ada",
            tweetText: "far",
            tweetCreatedAt: new Date("2026-01-02T00:00:00.000Z"),
          },
        ],
      });

      await prisma.bookmark.update({
        where: { id: nearId },
        data: {
          urls: [{ title: "Paper" }],
          quotedTweet: { id: "q1", text: "quoted" },
        },
      });
      await prisma.tag.create({
        data: {
          userId,
          name: "Rust",
          bookmarks: { create: { bookmarkId: nearId } },
        },
      });
      await prisma.note.create({
        data: { userId, bookmarkId: nearId, content: "margin" },
      });
      const listed = (await listBookmarksForEmbedding()).find((row) => row.bookmarkId === nearId);
      expect(listed).toMatchObject({
        tweetText: "near",
        tagNames: ["Rust"],
        note: "margin",
        urls: [{ title: "Paper" }],
        quotedTweet: { id: "q1", text: "quoted" },
      });

      const extension = await prisma.$queryRaw<{ extname: string }[]>`
        SELECT extname FROM pg_extension WHERE extname = 'vector'
      `;
      expect(extension).toEqual([{ extname: "vector" }]);

      const column = await prisma.$queryRaw<{ type: string }[]>`
        SELECT format_type(atttypid, atttypmod) AS type
        FROM pg_attribute
        WHERE attrelid = '"BookmarkEmbedding"'::regclass
          AND attname = 'embedding'
          AND NOT attisdropped
      `;
      expect(column).toEqual([{ type: "vector(768)" }]);

      const indexes = await prisma.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes WHERE tablename = 'BookmarkEmbedding'
      `;
      expect(indexes.length).toBeGreaterThan(0);
      for (const index of indexes) {
        expect(index.indexdef.toLowerCase()).not.toContain("hnsw");
        expect(index.indexdef.toLowerCase()).not.toContain("ivfflat");
      }

      await upsertBookmarkEmbeddings([
        {
          bookmarkId: nearId,
          model: "embeddinggemma-2:270m",
          dims: EMBEDDING_DIMS,
          embedding: axis(0),
          contentHash: "hash-near",
        },
        {
          bookmarkId: farId,
          model: "embeddinggemma-2:270m",
          dims: EMBEDDING_DIMS,
          embedding: axis(1),
          contentHash: "hash-far",
        },
      ]);

      const literal = toPgVectorLiteral(axis(0), EMBEDDING_DIMS);
      const ranked = await prisma.$queryRaw<{ bookmarkId: string }[]>`
        SELECT "bookmarkId"
        FROM "BookmarkEmbedding"
        WHERE "bookmarkId" IN (${nearId}, ${farId})
        ORDER BY "embedding" <=> ${literal}::vector ASC, "bookmarkId" ASC
      `;
      expect(ranked.map((row) => row.bookmarkId)).toEqual([nearId, farId]);

      await upsertBookmarkEmbeddings([
        {
          bookmarkId: nearId,
          model: "embeddinggemma-2:270m",
          dims: EMBEDDING_DIMS,
          embedding: axis(0),
          contentHash: "hash-near-2",
        },
      ]);
      const existing = await listExistingEmbeddingHashes("embeddinggemma-2:270m", EMBEDDING_DIMS);
      const near = existing.filter((row) => row.bookmarkId === nearId);
      expect(near).toEqual([{ bookmarkId: nearId, contentHash: "hash-near-2" }]);

      await prisma.bookmark.delete({ where: { id: nearId } });
      const remaining = await prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM "BookmarkEmbedding"
        WHERE "bookmarkId" = ${nearId}
      `;
      expect(remaining[0]?.count).toBe(0);
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
  });
});
