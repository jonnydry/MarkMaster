-- CreateIndex
CREATE INDEX "BookmarkTag_tagId_idx" ON "BookmarkTag"("tagId");

-- CreateIndex
CREATE INDEX "CollectionItem_bookmarkId_idx" ON "CollectionItem"("bookmarkId");

-- CreateIndex
CREATE INDEX "Note_userId_idx" ON "Note"("userId");
