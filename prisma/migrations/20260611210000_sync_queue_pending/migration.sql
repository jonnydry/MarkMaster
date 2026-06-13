-- Background sync queue: add PENDING status (must commit before use in a later migration).
ALTER TYPE "SyncRunStatus" ADD VALUE IF NOT EXISTS 'PENDING';
