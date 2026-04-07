-- CreateTable
CREATE TABLE "HiddenBookmark" (
    "userId" TEXT NOT NULL,
    "tweetId" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenBookmark_pkey" PRIMARY KEY ("userId","tweetId")
);

-- AddForeignKey
ALTER TABLE "HiddenBookmark" ADD CONSTRAINT "HiddenBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
