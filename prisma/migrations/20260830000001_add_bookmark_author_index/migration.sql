-- Supports the authorUsername sort (ORDER BY "authorUsername", "id") and
-- author-filtered lists without a full scan per page.
CREATE INDEX "Bookmark_userId_authorUsername_id_idx" ON "Bookmark"("userId", "authorUsername", "id");
