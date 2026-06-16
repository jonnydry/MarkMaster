-- Replace single-column indexes with composite (column, id) so keyset
-- pagination ties break deterministically when timestamps collide at ms
-- resolution (common in bulk X imports).
DROP INDEX IF EXISTS "Bookmark_userId_bookmarkedAt_idx";
DROP INDEX IF EXISTS "Bookmark_userId_tweetCreatedAt_idx";
CREATE INDEX IF NOT EXISTS "Bookmark_userId_bookmarkedAt_id_idx" ON "Bookmark"("userId", "bookmarkedAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "Bookmark_userId_tweetCreatedAt_id_idx" ON "Bookmark"("userId", "tweetCreatedAt" DESC, "id" DESC);
