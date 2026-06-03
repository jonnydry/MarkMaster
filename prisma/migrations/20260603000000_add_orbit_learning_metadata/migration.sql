ALTER TABLE "Bookmark" ADD COLUMN "xMetadata" JSONB;

CREATE TABLE "OrbitDecisionEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "bookmarkId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "source" TEXT,
  "mode" TEXT,
  "originalSuggestion" JSONB,
  "reviewedSuggestion" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrbitDecisionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrbitDecisionEvent_userId_createdAt_idx"
  ON "OrbitDecisionEvent"("userId", "createdAt" DESC);

CREATE INDEX "OrbitDecisionEvent_userId_bookmarkId_createdAt_idx"
  ON "OrbitDecisionEvent"("userId", "bookmarkId", "createdAt" DESC);

CREATE INDEX "OrbitDecisionEvent_userId_action_createdAt_idx"
  ON "OrbitDecisionEvent"("userId", "action", "createdAt" DESC);

ALTER TABLE "OrbitDecisionEvent"
  ADD CONSTRAINT "OrbitDecisionEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrbitDecisionEvent"
  ADD CONSTRAINT "OrbitDecisionEvent_bookmarkId_fkey"
  FOREIGN KEY ("bookmarkId") REFERENCES "Bookmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;
