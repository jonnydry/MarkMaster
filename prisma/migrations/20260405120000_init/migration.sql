-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "xId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "profileImageUrl" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tweetId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorUsername" TEXT NOT NULL,
    "authorDisplayName" TEXT NOT NULL,
    "authorProfileImage" TEXT,
    "authorVerified" BOOLEAN NOT NULL DEFAULT false,
    "tweetText" TEXT NOT NULL,
    "publicMetrics" JSONB,
    "media" JSONB,
    "urls" JSONB,
    "quotedTweet" JSONB,
    "tweetCreatedAt" TIMESTAMP(3) NOT NULL,
    "bookmarkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#1d9bf0',

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookmarkTag" (
    "bookmarkId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "BookmarkTag_pkey" PRIMARY KEY ("bookmarkId","tagId")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "shareSlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "bookmarkId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "bookmarkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_xId_key" ON "User"("xId");

-- CreateIndex
CREATE INDEX "Bookmark_userId_bookmarkedAt_idx" ON "Bookmark"("userId", "bookmarkedAt" DESC);

-- CreateIndex
CREATE INDEX "Bookmark_userId_tweetCreatedAt_idx" ON "Bookmark"("userId", "tweetCreatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_userId_tweetId_key" ON "Bookmark"("userId", "tweetId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_shareSlug_key" ON "Collection"("shareSlug");

-- CreateIndex
CREATE INDEX "CollectionItem_collectionId_sortOrder_idx" ON "CollectionItem"("collectionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionItem_collectionId_bookmarkId_key" ON "CollectionItem"("collectionId", "bookmarkId");

-- CreateIndex
CREATE UNIQUE INDEX "Note_bookmarkId_userId_key" ON "Note"("bookmarkId", "userId");

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookmarkTag" ADD CONSTRAINT "BookmarkTag_bookmarkId_fkey" FOREIGN KEY ("bookmarkId") REFERENCES "Bookmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookmarkTag" ADD CONSTRAINT "BookmarkTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_bookmarkId_fkey" FOREIGN KEY ("bookmarkId") REFERENCES "Bookmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_bookmarkId_fkey" FOREIGN KEY ("bookmarkId") REFERENCES "Bookmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

