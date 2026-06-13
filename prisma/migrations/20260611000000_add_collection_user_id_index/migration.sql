-- Index collection lookups by user (sidebar, settings, orbit graph).
CREATE INDEX IF NOT EXISTS "Collection_userId_updatedAt_idx"
  ON "Collection"("userId", "updatedAt" DESC);
