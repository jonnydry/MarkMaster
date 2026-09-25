-- Durable progress for Orbit's whole-queue auto-tag pass: the worker writes
-- counts and its cursor after every page so the client can show real
-- progress, survive reloads, stop a run, and resume one whose worker died.
CREATE TYPE "OrbitLibraryRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'CANCELLED', 'FAILED');

CREATE TABLE "OrbitLibraryRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "OrbitLibraryRunStatus" NOT NULL DEFAULT 'RUNNING',
    "total" INTEGER NOT NULL,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "applied" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "vocabulary" JSONB,
    "cursorBookmarkedAt" TIMESTAMP(3),
    "cursorId" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OrbitLibraryRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrbitLibraryRun_userId_startedAt_idx" ON "OrbitLibraryRun"("userId", "startedAt" DESC);

ALTER TABLE "OrbitLibraryRun" ADD CONSTRAINT "OrbitLibraryRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
