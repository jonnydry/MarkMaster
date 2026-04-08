ALTER TABLE "Collection"
ADD COLUMN "externalSource" TEXT,
ADD COLUMN "externalSourceId" TEXT;

CREATE UNIQUE INDEX "Collection_userId_externalSource_externalSourceId_key"
ON "Collection"("userId", "externalSource", "externalSourceId");
