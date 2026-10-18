# Database setup & migrations

Operational notes for Prisma + PostgreSQL (local Docker, Neon, production).

---

## `DATABASE_URL` and `DIRECT_URL`

The Prisma schema uses two connection strings:

| Variable | Used for | Local Docker | Neon |
|----------|----------|--------------|------|
| `DATABASE_URL` | App runtime queries (pooled) | Same as below | Pooled host (`…-pooler.…neon.tech`) |
| `DIRECT_URL` | Migrations (`prisma migrate *`) | Same as `DATABASE_URL` | Direct host (no `-pooler` in hostname) |

If `DIRECT_URL` is missing, Prisma fails at startup with **P1012** (`Environment variable not found: DIRECT_URL`).

### Local setup

After copying `.env.example` → `.env`, set both URLs to the same value:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/markmaster"
DIRECT_URL="postgresql://user:password@localhost:5432/markmaster"
```

### Neon setup

1. In [Neon console](https://console.neon.tech) → **Connect**, copy the **pooled** string → `DATABASE_URL`.
2. Copy the **direct** (non-pooler) string → `DIRECT_URL`.

Or derive direct from pooled by removing `-pooler` from the hostname:

```text
ep-example-pooler.c-6.us-east-1.aws.neon.tech  →  DATABASE_URL
ep-example.c-6.us-east-1.aws.neon.tech         →  DIRECT_URL
```

### Upgrading an existing `.env`

Branches that added `directUrl` to `prisma/schema.prisma` require `DIRECT_URL` in every environment (local, CI, Vercel). Add it before running `npm run db:status` or `npm run db:migrate`.

### Vercel / production

Set **both** variables in the project environment.

| Script | What it runs |
| --- | --- |
| `npm run db:migrate` | `prisma migrate deploy`. Applies pending migrations to the database in `DIRECT_URL`. |
| `npm run build` | `next build`. `prebuild` checks required env vars. This script does not migrate. |
| `npm run deploy:build` | `npm run db:migrate && npm run build`. Applies pending migrations, then builds. |

> **Warning.** If a Vercel build command runs `npm run deploy:build`, it will apply pending migrations to production on deploy. The migration can apply even when the later `next build` fails. Previews and CI should run `npm run build` and apply migrations as a separate release step.

---

## Common commands

```bash
npm run db:status    # prisma migrate status — pending migrations?
npm run db:migrate   # prisma migrate deploy — apply pending migrations
npm run db:studio    # Prisma Studio
npm run env:check    # required env vars (add DIRECT_URL manually if missing from check)
```

Local **new** migrations (creates SQL under `prisma/migrations/`):

```bash
npx prisma migrate dev --name <change-name>
```

Production and CI always use **`migrate deploy`**, not `migrate dev`.

---

## PostgreSQL enum gotcha

PostgreSQL does **not** allow using a newly added enum value in the same transaction as `ALTER TYPE … ADD VALUE`. Prisma runs each migration file in one transaction, so this fails:

```sql
-- ❌ Single migration — fails with "unsafe use of new value PENDING"
ALTER TYPE "SyncRunStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TABLE "SyncRun" ALTER COLUMN "status" SET DEFAULT 'PENDING';
```

**Fix:** split into two migrations:

1. **Add the enum value only** (e.g. `20260611210000_sync_queue_pending`).
2. **Use the new value** in a follow-up migration (e.g. `20260611210100_sync_queue_pending_default` — default, new columns, etc.).

### Recovering from a failed deploy

`--rolled-back` is only for a migration that failed partway. If `migrate deploy` fails mid-way:

```bash
npx prisma migrate resolve --rolled-back "<migration_name>"
```

Fix the migration SQL (or split it), then run `npm run db:migrate` again.

Prisma 6.19 errors with "not in a failed state" when that flag is used on a migration that already applied. It does not undo an applied migration. To remove something that already deployed, add a new forward migration and apply it with `npm run db:migrate`. Undoing `BookmarkEmbedding` is described in `docs/SMART_SEARCH.md`.

---

## Sync queue migration (2026-06)

Background sync enqueue uses `SyncRunStatus.PENDING`. Applied as two migrations:

| Migration | Purpose |
|-----------|---------|
| `20260611210000_sync_queue_pending` | Adds `PENDING` to `SyncRunStatus` enum |
| `20260611210100_sync_queue_pending_default` | Adds `continuationToken`, sets default status to `PENDING` |

Related production env vars (see `.env.example`): `SYNC_WORKER_SECRET`, `CRON_SECRET`.

---

## CI

GitHub Actions sets both URLs to the same local Postgres instance (see `.github/workflows/ci.yml`). The migrations job uses `pgvector/pgvector:pg16` so the smart-search migration can `CREATE EXTENSION vector`. No Neon-specific config in CI. Smart search setup is in `docs/SMART_SEARCH.md`.
