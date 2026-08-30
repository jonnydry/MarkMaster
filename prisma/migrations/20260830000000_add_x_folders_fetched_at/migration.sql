-- Track when the X bookmark-folders list API was last actually called.
-- Folder freshness was previously derived from Collection.updatedAt, which
-- every sync bumps — so the cache never expired for daily syncers.
ALTER TABLE "User" ADD COLUMN "xFoldersFetchedAt" TIMESTAMP(3);
