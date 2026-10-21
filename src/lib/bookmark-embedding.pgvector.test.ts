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

  it("stores one image vector per media item and cascades the bookmark delete", async () => {
    assertLocalDatabase(process.env.DATABASE_URL);
    const { prisma } = await import("@/lib/prisma");
    const {
      upsertBookmarkImageEmbeddings,
      listExistingImageEmbeddings,
      listBookmarksForImageEmbedding,
    } = await import("@/lib/image-embedding-backfill-store");

    const userId = `pgv_img_${randomUUID()}`;
    const photoId = `photo_${randomUUID()}`;
    const photoUrl = "https://pbs.twimg.com/photo.jpg";
    const thumbUrl = "https://pbs.twimg.com/thumb.jpg";

    await prisma.user.create({
      data: {
        id: userId,
        xId: userId,
        username: "pgvimg",
        displayName: "pgvimg",
        accessToken: "local-test",
        refreshToken: "local-test",
      },
    });

    try {
      await prisma.bookmark.create({
        data: {
          id: photoId,
          userId,
          tweetId: photoId,
          authorId: "author",
          authorUsername: "ada",
          authorDisplayName: "Ada",
          tweetText: "photo",
          tweetCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
          media: [
            { type: "photo", url: photoUrl },
            {
              type: "video",
              preview_image_url: thumbUrl,
              playback_url: "https://video.twimg.com/clip.mp4",
            },
          ],
        },
      });

      const listed = (await listBookmarksForImageEmbedding()).find((row) => row.bookmarkId === photoId);
      expect(listed?.images.map((image) => image.url).sort()).toEqual([photoUrl, thumbUrl].sort());

      const column = await prisma.$queryRaw<{ type: string }[]>`
        SELECT format_type(atttypid, atttypmod) AS type
        FROM pg_attribute
        WHERE attrelid = '"BookmarkImageEmbedding"'::regclass
          AND attname = 'embedding'
          AND NOT attisdropped
      `;
      expect(column).toEqual([{ type: "vector(768)" }]);

      await upsertBookmarkImageEmbeddings([
        {
          bookmarkId: photoId,
          mediaKey: photoUrl,
          model: "embeddinggemma-2:440m-q8_0-text-vision",
          dims: EMBEDDING_DIMS,
          embedding: axis(0),
          contentHash: "hash-photo",
        },
        {
          bookmarkId: photoId,
          mediaKey: thumbUrl,
          model: "embeddinggemma-2:440m-q8_0-text-vision",
          dims: EMBEDDING_DIMS,
          embedding: axis(1),
          contentHash: "hash-thumb",
        },
      ]);

      const literal = toPgVectorLiteral(axis(0), EMBEDDING_DIMS);
      const ranked = await prisma.$queryRaw<{ mediaKey: string }[]>`
        SELECT "mediaKey"
        FROM "BookmarkImageEmbedding"
        WHERE "bookmarkId" = ${photoId}
        ORDER BY "embedding" <=> ${literal}::vector ASC, "mediaKey" ASC
      `;
      expect(ranked.map((row) => row.mediaKey)).toEqual([photoUrl, thumbUrl]);

      const existing = await listExistingImageEmbeddings(
        "embeddinggemma-2:440m-q8_0-text-vision",
        EMBEDDING_DIMS
      );
      expect(existing.filter((row) => row.bookmarkId === photoId)).toHaveLength(2);

      await prisma.bookmark.delete({ where: { id: photoId } });
      const remaining = await prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM "BookmarkImageEmbedding"
        WHERE "bookmarkId" = ${photoId}
      `;
      expect(remaining[0]?.count).toBe(0);
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
  });

  it("runs the image search query once per bookmark and leaves a far hit below the cutoff", async () => {
    assertLocalDatabase(process.env.DATABASE_URL);
    const { prisma } = await import("@/lib/prisma");
    const { upsertBookmarkImageEmbeddings } = await import("@/lib/image-embedding-backfill-store");
    const { DEFAULT_IMAGE_EMBEDDING_MODEL } = await import("@/lib/embedding-provider");
    const { searchImageEmbeddingHits } = await import("@/lib/smart-bookmark-search");
    const { mergeTextAndImageHits } = await import("@/lib/smart-search-merge");

    const userId = `pgv_q_${randomUUID()}`;
    const otherUserId = `pgv_o_${randomUUID()}`;
    const nearId = `near_${randomUUID()}`;
    const farId = `far_${randomUUID()}`;
    const leakedId = `aaa_${randomUUID()}`;
    const model = DEFAULT_IMAGE_EMBEDDING_MODEL;

    async function makeUser(id: string) {
      await prisma.user.create({
        data: {
          id,
          xId: id,
          username: id,
          displayName: "pgv",
          accessToken: "local-test",
          refreshToken: "local-test",
        },
      });
    }

    function makeBookmark(id: string, ownerId: string, text: string) {
      return {
        id,
        userId: ownerId,
        tweetId: id,
        authorId: "author",
        authorUsername: "ada",
        authorDisplayName: "Ada",
        tweetText: text,
        tweetCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
      };
    }

    await makeUser(userId);
    await makeUser(otherUserId);

    try {
      await prisma.bookmark.createMany({
        data: [
          makeBookmark(nearId, userId, "near"),
          makeBookmark(farId, userId, "far"),
          makeBookmark(leakedId, otherUserId, "leak"),
        ],
      });

      await upsertBookmarkImageEmbeddings([
        {
          bookmarkId: nearId,
          mediaKey: "https://pbs.twimg.com/near.jpg",
          model,
          dims: EMBEDDING_DIMS,
          embedding: axis(0),
          contentHash: "near",
        },
        {
          bookmarkId: nearId,
          mediaKey: "https://pbs.twimg.com/near-thumb.jpg",
          model,
          dims: EMBEDDING_DIMS,
          embedding: axis(2),
          contentHash: "thumb",
        },
        {
          bookmarkId: farId,
          mediaKey: "https://pbs.twimg.com/far.jpg",
          model,
          dims: EMBEDDING_DIMS,
          embedding: axis(1),
          contentHash: "far",
        },
        {
          bookmarkId: leakedId,
          mediaKey: "https://pbs.twimg.com/leaked.jpg",
          model,
          dims: EMBEDDING_DIMS,
          embedding: axis(0),
          contentHash: "leak",
        },
      ]);

      const hits = await searchImageEmbeddingHits(
        prisma.$queryRaw.bind(prisma),
        {
          userId,
          search: "axis",
          searchTerms: [],
          authorFilter: "",
          tagIds: [],
          mediaFilter: "all",
          unaffiliated: false,
          raw: false,
          sortField: "bookmarkedAt",
          sortDirection: "desc",
        },
        { model, dims: EMBEDDING_DIMS, embed: async () => [] },
        toPgVectorLiteral(axis(0), EMBEDDING_DIMS)
      );

      expect(hits.map((hit) => hit.id)).toEqual([nearId, farId]);
      expect(hits.filter((hit) => hit.id === nearId)).toHaveLength(1);
      expect(hits[0]?.similarity).toBeCloseTo(1, 5);
      expect(hits[1]?.similarity).toBeCloseTo(0, 5);

      const merged = mergeTextAndImageHits([], hits);
      expect(merged.orderedIds).toEqual([nearId]);
      expect(merged.imageMatchedIds).toEqual([nearId]);
    } finally {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: otherUserId } }).catch(() => undefined);
    }
  });
});
