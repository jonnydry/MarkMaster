-- Per-user X Developer app credentials, encrypted with the same AES-256-GCM
-- layout as access/refresh tokens (ENCRYPTION_KEY). Null means unset.
-- Host AUTH_TWITTER_* is not a substitute for these on the public hosted app.
ALTER TABLE "User" ADD COLUMN "xClientId" TEXT;
ALTER TABLE "User" ADD COLUMN "xClientSecret" TEXT;
