CREATE TABLE "OrbitTagAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "taggedBookmarkCount" INTEGER NOT NULL,
    "judgedBookmarkCount" INTEGER NOT NULL,
    "outcome" JSONB,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrbitTagAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrbitTagAudit_userId_createdAt_idx" ON "OrbitTagAudit"("userId", "createdAt" DESC);

ALTER TABLE "OrbitTagAudit" ADD CONSTRAINT "OrbitTagAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrbitTagAuditProposal" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "bookmarkId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "swapTagId" TEXT,
    "reason" TEXT NOT NULL,
    "currentScore" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "OrbitTagAuditProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrbitTagAuditProposal_auditId_bookmarkId_tagId_key" ON "OrbitTagAuditProposal"("auditId", "bookmarkId", "tagId");

CREATE INDEX "OrbitTagAuditProposal_auditId_rank_idx" ON "OrbitTagAuditProposal"("auditId", "rank");

ALTER TABLE "OrbitTagAuditProposal" ADD CONSTRAINT "OrbitTagAuditProposal_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "OrbitTagAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrbitTagAuditUndo" (
    "auditId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joins" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" TIMESTAMP(3),

    CONSTRAINT "OrbitTagAuditUndo_pkey" PRIMARY KEY ("auditId")
);

ALTER TABLE "OrbitTagAuditUndo" ADD CONSTRAINT "OrbitTagAuditUndo_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "OrbitTagAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
