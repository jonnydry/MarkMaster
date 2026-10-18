-- Smart search stores 768-d embeddings beside bookmarks.
-- The extension has to be created inside the migration so Prisma's shadow
-- database (and a fresh CI database) can apply the table that follows.
-- Exact scan only: no HNSW or IVFFlat index at this library size.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "BookmarkEmbedding" (
    "bookmarkId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dims" INTEGER NOT NULL,
    "embedding" vector(768) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookmarkEmbedding_pkey" PRIMARY KEY ("bookmarkId","model","dims")
);

ALTER TABLE "BookmarkEmbedding"
    ADD CONSTRAINT "BookmarkEmbedding_bookmarkId_fkey"
    FOREIGN KEY ("bookmarkId") REFERENCES "Bookmark"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
