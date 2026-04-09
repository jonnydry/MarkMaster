CREATE TYPE "SyncRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'RATE_LIMITED', 'FAILED');

CREATE TABLE "SyncRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "SyncRunStatus" NOT NULL DEFAULT 'RUNNING',
  "newBookmarks" INTEGER NOT NULL DEFAULT 0,
  "updatedBookmarks" INTEGER NOT NULL DEFAULT 0,
  "totalFetched" INTEGER NOT NULL DEFAULT 0,
  "hitExisting" BOOLEAN NOT NULL DEFAULT false,
  "rateLimited" BOOLEAN NOT NULL DEFAULT false,
  "rateLimitResetsAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SyncRun_userId_startedAt_idx" ON "SyncRun"("userId", "startedAt" DESC);
CREATE INDEX "SyncRun_userId_status_startedAt_idx" ON "SyncRun"("userId", "status", "startedAt" DESC);

ALTER TABLE "SyncRun"
ADD CONSTRAINT "SyncRun_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
