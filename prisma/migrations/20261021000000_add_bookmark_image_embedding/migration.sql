-- Image search stores one 768-d embedding per bookmark media item.
-- Same provenance as BookmarkEmbedding: model and dims are part of the key.
-- The extension is created again so a shadow database that applies this
-- migration on its own still has vector. Exact scan only: no ANN index.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "BookmarkImageEmbedding" (
    "bookmarkId" TEXT NOT NULL,
    "mediaKey" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dims" INTEGER NOT NULL,
    "embedding" vector(768) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookmarkImageEmbedding_pkey" PRIMARY KEY ("bookmarkId","mediaKey","model","dims")
);

ALTER TABLE "BookmarkImageEmbedding"
    ADD CONSTRAINT "BookmarkImageEmbedding_bookmarkId_fkey"
    FOREIGN KEY ("bookmarkId") REFERENCES "Bookmark"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
