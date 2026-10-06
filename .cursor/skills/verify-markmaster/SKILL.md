---
name: verify-markmaster
description: Drive the local MarkMaster web app in a headless browser as a seeded reader, then capture screenshots, console errors, network errors, and DOM measurements. Use when changing the dashboard, bookmark cards, Orbit, collections, or settings tags, or when asked to verify MarkMaster.
---

# Verify MarkMaster

MarkMaster's primary surface is the authenticated web UI. Share pages and the API exist, but this skill drives the signed-in app. Run one instance at a time. A second launch against the same ports is refused.

Sign-in uses a seeded local user and a session cookie minted with this run's `AUTH_SECRET`. It does not use an X account, an X client secret, or an xAI or TypeSafe key. Those keys are set to empty on the server process so a developer `.env` cannot turn them back on. The driver aborts any browser request that leaves `127.0.0.1`.

## Launch

From the repo root:

```bash
node .cursor/skills/verify-markmaster/bin/launch.mjs
```

Launch creates run state under the OS temp directory at `markmaster-verify/<run-id>/` (`/tmp/markmaster-verify/<run-id>/` on Linux) and writes the pointer `markmaster-verify/current/state.json`. The files stay outside the repo so Postgres and the Next.js log do not trigger Fast Refresh.

Postgres listens on `127.0.0.1:54329` and owns the database `markmaster_verify`. When `docker` is on `PATH`, launch starts a container named `markmaster-verify-pg-<run-id>` with the label `markmaster-verify=1` from `postgres:16-alpine`. Otherwise it runs `initdb` and `postgres` from `/usr/lib/postgresql/<version>/bin` with a data directory inside the run folder. It does not use `npm run db:up`, because that compose file publishes port 5432 and the `markmaster` database.

Launch then runs `npx prisma migrate deploy`, `npm run db:seed:verify`, and mints `authjs.session-token` with `@auth/core/jwt` `encode`. The salt is the cookie name. The token carries `dbUser`, `sessionVersion`, and `sessionValidatedAt` for the seeded user.

Next.js starts with `npm run dev -- --hostname 127.0.0.1 --port 3100`. Ready means `GET http://127.0.0.1:3100/login` returns 200. The first compile can take a few minutes.

Override ports with `VERIFY_APP_PORT` and `VERIFY_PG_PORT` before launch. If either port is already taken, launch exits and names the fix. If a verify Next.js pid from the state file is still alive, launch exits and tells you to drive that instance or clean it up. Do not start a second one.

Placeholder X credentials are `verify-not-a-real-client` and `verify-not-a-real-secret`. They exist so `npm run env:check` can pass. Nothing in this flow calls X.

## Doctor

```bash
node .cursor/skills/verify-markmaster/bin/doctor.mjs
```

Doctor is read-only. It exits 0 only when all of these are true.

- The state file exists and the run is not stopped.
- The Next.js pid is alive, and the process listening on port 3100 is that pid or a child. Doctor reads `ss` when it is installed, and `/proc/net/tcp` otherwise.
- Postgres for a local cluster is still the pid launch recorded.
- `DATABASE_URL` is `127.0.0.1` and the database name is `markmaster_verify`.
- The running process env matches the state `AUTH_SECRET` and `DATABASE_URL`.
- `AUTH_TWITTER_ID` and `AUTH_TWITTER_SECRET` are the placeholders above.
- `XAI_API_KEY` and `TYPESAFE_API_KEY` are empty.
- `npx prisma migrate status` exits 0.
- The user `verify_reader` (`xId` `verify-markmaster-local`) exists and matches `state.userId`.
- The session cookie decrypts to that user.
- `GET /login` returns 200 and `GET /api/auth/session` returns `dbUser.username` `verify_reader`.

On failure, doctor prints each problem and a fix command. Run doctor before a drive whenever the app looks wrong.

## Drive

```bash
node .cursor/skills/verify-markmaster/bin/drive.mjs
```

Drive one feature or one viewport:

```bash
node .cursor/skills/verify-markmaster/bin/drive.mjs --feature dashboard-feed --viewport desktop
node .cursor/skills/verify-markmaster/bin/drive.mjs --feature orbit --viewport mobile-375
```

Features: `dashboard-feed`, `collections`, `settings-tags`, `orbit`, `bookmark-card`.

Viewports: `desktop` (1280x800), `mobile-375` (375x812, touch), `mobile-390` (390x844, touch).

Drive reseeds the database before each viewport and mints a new cookie, so a mutation in one viewport does not leak into the next. Chrome is launched headless through Playwright (`channel: "chrome"`). The context gets the session cookie. The driver does not open `/login` and does not start the X OAuth flow.

Browser requests whose host is not `127.0.0.1`, `localhost`, or `[::1]` are aborted and recorded. Do not click `Open on X`, `Sync`, `Start auto-tag`, or a scan control. Auto-tag stays locked because `TYPESAFE_API_KEY` is empty. That locked row is the proof that the Mode menu is wired and that no TypeSafe call starts.

Selectors and expected text live in `features/`. Follow a feature file rather than inventing a shorter path.

The first client navigation to a route `next dev` has not compiled yet can full-reload the current page and drop the click. Drive retries that click. Collection detail has no `Open menu` button. From that page, Drive uses `Back to collections`, then the sidebar or the menu.

## Evidence

Artifacts go to the `evidenceDir` in the state file, which is `markmaster-verify/<run-id>/evidence/` under the OS temp directory. Cleanup does not delete it.

Each feature and viewport writes:

- `<viewport>/<feature>.png` (and extra shots named in the feature file)
- `<viewport>/<feature>.console.json` for console errors and page errors
- `<viewport>/<feature>.network.json` for aborted external URLs and same-origin HTTP errors
- `<viewport>/<feature>.measure.json` with `scrollWidth`, `innerWidth`, and `ok` (`scrollWidth <= innerWidth`)

`evidence/summary.json` lists pass or fail per feature and viewport. Drive exits 1 when any row failed, when the browser completed a request to a host other than loopback, or when that run's `next.log` contains `api.x.com`, `api.twitter.com`, `x.com`, `twitter.com`, `api.x.ai`, or `typesafe.ai`.

A proof shows the user action and the resulting state. A tag click is not done until the card shows the tag after reload. A collection open is not done until the bookmark text is on the detail page.

## Cleanup

```bash
node .cursor/skills/verify-markmaster/bin/cleanup.mjs
```

Cleanup reads the state file and stops only those processes.

- It sends `SIGTERM` to the Next.js process group.
- It runs `dropdb --if-exists markmaster_verify` against the verify port.
- For Docker, it removes the container only when the `markmaster-verify` label is `1`.
- For a local cluster, it stops the recorded Postgres pid and deletes that run's `pgdata` directory.

It leaves `evidence/` in place. After cleanup, confirm `evidence/summary.json` still exists and that ports 3100 and 54329 are closed.

## Helpers

| Command | What it does |
| --- | --- |
| `node .cursor/skills/verify-markmaster/bin/launch.mjs` | Start Postgres, migrate, seed, mint a session, start Next.js |
| `node .cursor/skills/verify-markmaster/bin/doctor.mjs` | Read-only health check |
| `node .cursor/skills/verify-markmaster/bin/drive.mjs` | Browser proof for every mapped feature |
| `node .cursor/skills/verify-markmaster/bin/cleanup.mjs` | Stop this run and drop `markmaster_verify` |
| `npm run db:seed:verify` | Replace the verify user. Requires `DATABASE_URL` and `ENCRYPTION_KEY` |

The seed implementation is `scripts/seed-verify.mjs`. The shared names are `scripts/verify-fixture.mjs`.

Playwright is a devDependency because the repo had no browser driver. Drive uses the installed Google Chrome via Playwright's `channel: "chrome"` so it does not download a second browser.

When these screens change, run `/maintain-verification-skill` and drive every feature file again.
