# Operations Runbook

Short, practical answers for "production is misbehaving, what do I do".

## Where to look first

- **Health probe** — `GET /api/health` (unauthenticated, exempt from rate
  limiting). `{ "status": "ok" }` means the app *and* database are reachable;
  `503 { "status": "degraded" }` means the app is up but the DB check failed.
- **Logs** — on Vercel: Project → Logs (function logs). All server errors flow
  through `src/lib/logger.ts`, which redacts secrets and flattens stacks to a
  single line, and through the `onRequestError` hook in
  `src/instrumentation.ts` (`[RequestError]` lines include method, path, route
  and digest). Self-hosted: wherever `next start`'s stdout/stderr goes.
- **Debug endpoints** — `/api/debug/rate-limits` shows live limiter state.
  Gated by `OWNER_USER_ID` (your Prisma `User.id`); fails closed in production
  if unset.

## Stuck sync queue

Symptoms: users see "A sync is already running" (409) long after nothing is
running, or runs sit in `PENDING`.

Built-in self-healing (know these before intervening):

- Runs `PENDING`/`RUNNING` older than **30 minutes** are auto-marked `FAILED`
  ("Sync did not finish.") the next time that user's sync status is read or a
  new sync is enqueued.
- A Vercel Cron hits `GET /api/internal/sync/worker` every **5 minutes**
  (see `vercel.json`) and drains up to 3 pending runs per invocation.
- A failed worker dispatch marks the run `FAILED` immediately (only while it
  is still `PENDING`).

Manual drain (any environment):

```bash
curl -X GET "$APP_URL/api/internal/sync/worker" \
  -H "Authorization: Bearer $CRON_SECRET"        # SYNC_WORKER_SECRET also works
```

Target one specific run:

```bash
curl -X POST "$APP_URL/api/internal/sync/worker" \
  -H "Authorization: Bearer $SYNC_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"runId":"<SyncRun.id>"}'
```

Last resort, SQL (marks everything stale-failed immediately):

```sql
UPDATE "SyncRun"
SET "status" = 'FAILED', "completedAt" = now(),
    "errorMessage" = 'Manually failed by operator.'
WHERE "status" IN ('PENDING', 'RUNNING');
```

Safe: the executor writes are conditional on `status = 'RUNNING'`, so a
manually-failed run cannot be resurrected by a still-running invocation.

## Rate limiting incidents

- **Everything returns 503 "Rate limiting is not configured"** — production
  fails closed when `UPSTASH_REDIS_REST_URL`/`_TOKEN` are missing. Set them
  and redeploy. Auth, share pages, `/api/health`, `/api/orbit/status`, and
  the internal sync routes stay reachable during this state.
- **Upstash outage** — runtime Redis errors deliberately **fail open** (users
  keep working, throttling is silently off). Evidence: `[Proxy] … rate limit
  check failed (failing open)` log lines. No action usually needed; watch for
  abuse until Upstash recovers.
- **One user wrongly throttled** — inspect `/api/debug/rate-limits`; keys are
  prefixed `ratelimit:*` in Redis if you need to delete a bucket by hand.

## Secret rotation — read before rotating

- **`AUTH_SECRET`** — rotating it invalidates every session cookie: a global
  logout. For a single compromised account, prefer a per-user revocation
  (below) — rotate the secret only if the secret itself may have leaked.
- **`ENCRYPTION_KEY`** — rotating it orphans every stored X access/refresh
  token: token decryption fails, and every user must reconnect X before the
  next sync works. There is no re-encryption tool. Rotate only if the key
  itself is suspected compromised, and expect a "reconnect X" wave. User data
  (bookmarks, tags, collections) is unaffected.
- **`SYNC_WORKER_SECRET` / `CRON_SECRET`** — safe to rotate anytime; update
  the Vercel Cron config/env in the same deploy. Both are accepted by the
  worker route, so rotate one at a time for zero downtime.
- **X OAuth (`AUTH_TWITTER_ID`/`_SECRET`)** — rotating the app secret in the
  X developer portal invalidates nothing stored, but new sign-ins fail until
  the env vars match.

## Revoking a single user's sessions

Sessions are JWTs, but each token re-checks `User.sessionVersion` at most
every 5 minutes (`SESSION_REVALIDATE_INTERVAL_MS` in
`src/lib/auth-callbacks.ts`). Bumping the version signs the user out on every
device within that window:

```sql
UPDATE "User" SET "sessionVersion" = "sessionVersion" + 1
WHERE "username" = '<x-username>';
```

Users can self-serve the same thing via Settings → Account → "Sign out
everywhere" (`POST /api/user/revoke-sessions`). Note the check fails open on
database errors by design — a DB outage does not log everyone out, it just
delays revocation until the DB is reachable.

## Database

- Migrations: `npm run db:migrate` (uses `DIRECT_URL`; see
  [DATABASE.md](./DATABASE.md) for Neon specifics). CI applies all migrations
  to a clean Postgres on every push, so a broken migration should be caught
  before deploy.
- `npm run dev` refuses to start with unapplied migrations
  (`SKIP_DB_MIGRATION_CHECK=1` to bypass during UI-only work).

## Share pages serving stale/revoked content

Public share pages cache their data for up to 5 minutes
(`src/lib/public-share-cache.ts`). Publish/unpublish, rename, and delete all
expire the cache immediately — if a stale page persists beyond that, check
that the deploy includes `expirePublicShareCache` calls in
`src/app/api/collections/[id]/route.ts`. Share-link expiry (`shareExpiresAt`)
is enforced at request time against the cached value, so an expired link never
serves stale content while waiting out the cache window.
