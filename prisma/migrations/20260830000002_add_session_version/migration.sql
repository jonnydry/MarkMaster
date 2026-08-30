-- Per-user session revocation: bumping sessionVersion invalidates all of the
-- user's JWT sessions within the revalidation window (see auth-callbacks.ts).
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 1;
