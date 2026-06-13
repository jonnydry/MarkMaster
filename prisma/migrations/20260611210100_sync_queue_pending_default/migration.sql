-- Apply PENDING default and continuation token after enum value is committed.
ALTER TABLE "SyncRun" ADD COLUMN IF NOT EXISTS "continuationToken" TEXT;

ALTER TABLE "SyncRun" ALTER COLUMN "status" SET DEFAULT 'PENDING';
