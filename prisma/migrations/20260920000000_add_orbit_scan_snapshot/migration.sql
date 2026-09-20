-- Per-user durable Orbit scan plan so a paid scan survives new devices
-- and cleared sessionStorage. One row per user; bookmark bodies are never stored.
CREATE TABLE "OrbitScanSnapshot" (
    "userId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrbitScanSnapshot_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "OrbitScanSnapshot" ADD CONSTRAINT "OrbitScanSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
