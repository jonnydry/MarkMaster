# MarkMaster verification map

This directory is the maintained source for verifying the signed-in MarkMaster web UI. Read this index, then follow one feature file.

## Baseline preconditions

- Launch with `node .cursor/skills/verify-markmaster/bin/launch.mjs`.
- The app origin is `http://127.0.0.1:3100` unless `VERIFY_APP_PORT` was set.
- Postgres is a database named `markmaster_verify` on `127.0.0.1:54329` unless `VERIFY_PG_PORT` was set.
- The seeded user is `verify_reader`. The session cookie is `authjs.session-token`, minted for that user.
- `XAI_API_KEY`, `TYPESAFE_API_KEY`, `CRON_SECRET`, `SYNC_WORKER_SECRET`, and `OWNER_USER_ID` are empty. `AUTH_TWITTER_ID` is `verify-not-a-real-client`. `VERIFY_MARKMASTER` is `1`.
- Run `node .cursor/skills/verify-markmaster/bin/doctor.mjs` and require the `OK` line.
- Never drive an instance that this launch did not start.

## Driving conventions

- Start every recipe from the seeded library. Drive reseeds before each viewport.
- Prefer the accessible names in the feature files.
- Treat every command as literal.
- Run the browser through `node .cursor/skills/verify-markmaster/bin/drive.mjs`.
- Do not click Sync, Open on X, Start auto-tag, or a scan control.
- Keep proof files under the run's `evidence/` directory. Cleanup must not delete them.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- Every feature writes a screenshot, `console.json`, `network.json`, and `measure.json`.
- `measure.json` must have `ok: true`, meaning `scrollWidth <= innerWidth`.
- Record the feature id and the viewport with every artifact.
- Report an unreachable path with the command you ran and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 and one paragraph. It then uses these four H2 sections, in order.

1. `Sub-features`
2. `How to get to it (user POV)`
3. `Driving it with verify-markmaster`
4. `Gotchas`

## Features

- [Dashboard feed and highlights](./dashboard-feed.md) covers the bookmark feed and the Discovery highlights strip.
- [Bookmark card actions](./bookmark-card.md) covers tag, note, and collection actions on a feed card.
- [Orbit auto-tag and Mode](./orbit.md) covers the Mode menu, the locked auto-tag row, and the Queue/Map switch.
- [Collections](./collections.md) covers the collections list and opening Reading list.
- [Settings tags](./settings-tags.md) covers tag search and saving a rename when the editor blurs.

Analytics is a real route at `/analytics` and is not in this map yet.
