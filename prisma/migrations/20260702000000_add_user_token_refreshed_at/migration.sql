-- Track when valid X tokens were last obtained (sign-in, reconnect, or refresh)
-- so the client can clear "reconnect X" prompts after a successful re-auth.
ALTER TABLE "User" ADD COLUMN "tokenRefreshedAt" TIMESTAMP(3);
