-- CreateTable
CREATE TABLE "FlywheelEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlywheelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlywheelEvent_userId_createdAt_idx" ON "FlywheelEvent"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "FlywheelEvent_userId_eventType_createdAt_idx" ON "FlywheelEvent"("userId", "eventType", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "FlywheelEvent" ADD CONSTRAINT "FlywheelEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
