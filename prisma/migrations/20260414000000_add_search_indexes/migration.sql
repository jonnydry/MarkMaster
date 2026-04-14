-- Enable pg_trgm extension for trigram-based text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN indexes on searchable text columns for fast ILIKE/contains queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Bookmark_tweetText_trgm_idx" ON "Bookmark" USING GIN ("tweetText" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Bookmark_authorUsername_trgm_idx" ON "Bookmark" USING GIN ("authorUsername" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Bookmark_authorDisplayName_trgm_idx" ON "Bookmark" USING GIN ("authorDisplayName" gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Note_content_trgm_idx" ON "Note" USING GIN ("content" gin_trgm_ops);