-- Optional expiry for public collection share links. When set, the share
-- page and publish endpoint treat the link as revoked once the instant
-- passes; null means the link never expires.
ALTER TABLE "Collection" ADD COLUMN "shareExpiresAt" TIMESTAMP(3);
