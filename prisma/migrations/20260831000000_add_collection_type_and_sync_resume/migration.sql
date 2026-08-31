-- Schema fields that landed in prisma/schema.prisma without a matching
-- migration: Collection.type (CollectionType) and SyncRun resume metadata.
-- IF NOT EXISTS keeps this safe on databases that already received the
-- columns via `prisma db push`.

DO $$ BEGIN
    CREATE TYPE "CollectionType" AS ENUM ('x_folder', 'user_collection');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Collection" ADD COLUMN IF NOT EXISTS "type" "CollectionType" NOT NULL DEFAULT 'user_collection';

UPDATE "Collection"
SET "type" = 'x_folder'
WHERE "externalSource" = 'x-bookmark-folder';

ALTER TABLE "SyncRun" ADD COLUMN IF NOT EXISTS "pagesFetched" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SyncRun" ADD COLUMN IF NOT EXISTS "resumeToken" TEXT;
