# Smart search (local prototype)

Opt-in bookmark search that blends EmbeddingGemma 2 vectors with the existing ILIKE keyword list. The default `GET /api/bookmarks` response is unchanged. Smart search runs only when the request includes `mode=smart`.

Vectors are 768-dimensional and come from Ollama on this machine. There is no hosted Gemini provider in this prototype. `createEmbeddingProvider` in `src/lib/embedding-provider.ts` is where a future hosted provider would be constructed.

## Verified model

Checked against the Ollama library and the EmbeddingGemma 2 model card on 2026-10-18.

| | |
|---|---|
| Ollama tag | `embeddinggemma-2:270m` |
| Library | https://ollama.com/library/embeddinggemma-2 |
| Size on that page | 304MB–378MB, text |
| Output dimensions | 768 |
| Query prefix | `task: search result \| query: ` |
| Document prefix | `title: none \| text: ` |

`embeddinggemma-2:latest` on the same page is the larger multimodal build (about 1.3GB). The default `EMBEDDING_MODEL` is the 270m tag.

Image search uses a second tag, `embeddinggemma-2:440m-q8_0-text-vision`. It embeds text and images into the same 768-dimensional space. The text index stays on the 270m tag. See [Image search](#5-image-search) below.

The prefixes are the search pair published on the model card and in the sentence-transformers prompt table (`Retrieval-query` / `SearchQuery`, and `Retrieval-document` / `Document`):

- https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2
- https://ai.google.dev/gemma/docs/embeddinggemma/inference-embeddinggemma-with-sentence-transformers
- https://huggingface.co/google/embeddinggemma-2

Ollama embeds the string it is given. This app adds the prefixes. Bookmarks have no single title, so documents use `title: none`. Link titles, quoted text, tags, and the note are inside the document body.

Queries and stored vectors must use this same model and 768 dimensions.

## What smart search does

`GET /api/bookmarks?search=...&mode=smart`

1. Embed the raw search string as a query with the text model. The wait is a cap (`SMART_SEARCH_EMBED_TIMEOUT_MS`, default 4000 milliseconds, in `src/lib/embedding-provider.ts`). The call returns when Ollama responds, and aborts only if it is still running at the cap. Set `SMART_SEARCH_EMBED_TIMEOUT_MS` to a positive number of milliseconds to override it. A blank, non-finite, or non-positive value is ignored, and any accepted value is clamped to 1–30000 milliseconds. When this user has image embeddings, also embed that same string with the vision model's text side, under the same cap. Each embed request sends `keep_alive` from `OLLAMA_EMBED_KEEP_ALIVE` (default `30m`, a duration from 1s to 24h). `-1`, `0`, and anything outside that range are ignored, so the app never pins a model until restart. That value overrides the server's `OLLAMA_KEEP_ALIVE` for the request. After a query embed times out, the next searches skip the embed step and serve the keyword list for 60 seconds, then the following search tries embedding again. There is no setting for that pause. On the Ollama server, set `OLLAMA_MAX_LOADED_MODELS` to at least 2. With one loaded model, switching between `embeddinggemma-2:270m` and `embeddinggemma-2:440m-q8_0-text-vision` costs about 1.4–1.7 seconds, and a warm call is about 45 milliseconds, so a 1.5 second cap failed every query that had to swap. Repeat queries for the same model and text reuse an in-memory cache.
2. Take the closest 50 stored text vectors by pgvector cosine distance (`<=>`), with the current filters (user, tags, dates, collection, author, media, unaffiliated, raw).
3. Take the closest 50 image vectors the same way. Each bookmark keeps its best image. Drop an image hit whose cosine similarity is below the cutoff (default `IMAGE_HIT_SIMILARITY_CUTOFF`, 0.68, in `src/lib/smart-search-merge.ts`). Set `IMAGE_HIT_SIMILARITY_CUTOFF` in the environment to override it; a non-finite value or a value outside `(0, 1)` is ignored. An image hit that clears the cutoff scores `similarity - IMAGE_HIT_SCORE_OFFSET` (`IMAGE_HIT_SCORE_OFFSET` is 0.03). The bookmark's merged score is the higher of its text cosine and that image score. When the bookmark is on both lists, add `DUAL_MATCH_SCORE_BONUS` (0.02). A text-only bookmark keeps its cosine, with nothing subtracted. Keyword hits are not part of this merge; they are fused in the next step.
4. Take the keyword hits from the same ILIKE terms as today, and keep the first 200 in the request's `sortField` / `sortDirection` (default `bookmarkedAt desc`). Those 200 are the first rows in that sort order, not the best ILIKE matches: a later row is dropped even when its text matches more closely. The default keyword list is not capped.
5. Score the merged vector list and the keyword list with Reciprocal Rank Fusion, k = 60: `1/(60+rank)` from each list, ranks starting at 1.
6. Return that order, paged with `page` and `limit`. Bookmarks that cleared the image cutoff include `imageMatch: true`. The feed, compact, and grid cards show "Image match" on those rows. There is no setting for it.

The response adds:

```json
"search": {
  "mode": "smart",
  "fallback": null,
  "model": "embeddinggemma-2:270m",
  "dims": 768,
  "vectorHits": 50,
  "imageHits": 12,
  "imageModel": "embeddinggemma-2:440m-q8_0-text-vision",
  "imageMatchedIds": ["bookmark id"],
  "keywordHits": 12
}
```

`imageHits`, `imageModel`, and `imageMatchedIds` are present when image embeddings were searched. A library with only text embeddings omits them. If the vision embed hits the cap and the text embed succeeds, the text list is fused with the keyword list and those bookmarks are still returned. If every query embed hits the cap, the handler returns today's keyword list. Either timeout opens the 60-second pause above, so the searches during that pause are the keyword list too.

If Ollama is unreachable, the call times out, or this user has no rows for the configured model and dimensions, the handler returns today's keyword list and sets `search.fallback` to `provider_unavailable`, `timeout`, or `no_embeddings`. An empty search sets `empty_query` and returns the normal list.

There is no library toggle. Pagination for a fused result uses `page` and `limit`. The keyset `cursor` is for the default list.

New and edited bookmarks stay unembedded until the backfill runs again. The script skips rows whose content hash is unchanged.

The migration creates `BookmarkEmbedding` and runs `CREATE EXTENSION IF NOT EXISTS vector`. It does not add an HNSW or IVFFlat index. Retrieval is an exact scan.

## Two databases: dev and prod

MarkMaster's Neon project has two branches:

| Branch | Use |
|---|---|
| `production` | The real library. Migrations and backfills run here only on purpose, with the prod flag. |
| `dev` | A copy-on-write child of `production` for experiments: migrations, backfills, other embedding models. Reset it from `production` whenever it gets messy. |

The target setup is that jdry's `DATABASE_URL` and `DIRECT_URL` point at `dev` and the prod URLs are not kept in the day-to-day env files. Until the one-time setup below is done, jdry still points at prod, and the guard refuses writes there.

### The prod guard

`npm run db:migrate`, `npm run embeddings:backfill`, `npm run embeddings:backfill-images`, `npm run embeddings:image-scores`, and `node scripts/merge-duplicate-gems.mjs --apply` check their connection URLs before they connect (`scripts/db-target-guard.mjs`). `embeddings:image-scores` only runs `SELECT`; the guard still refuses a prod URL so a score print does not run against prod by accident. `db:migrate` resolves `DATABASE_URL` and `DIRECT_URL` the way Prisma does (shell environment first, then `.env`, then `prisma/.env`; a variable that is already set is never overridden), requires both, and starts Prisma with exactly the values it checked. It accepts no arguments except `--prod`: anything else, such as `--schema`, is refused, because it could make Prisma use a datasource the guard did not check. It always runs `prisma migrate deploy --schema prisma/schema.prisma`, and refuses to run while the nearest `package.json` has a `prisma` key or any Prisma config exists in the places Prisma 6 looks: `prisma.config.<ext>` or `prisma.config/index.<ext>` at the repo root, and `prisma.<ext>`, `prisma/index.<ext>`, `prisma.config.<ext>` or `prisma.config/index.<ext>` under `.config/`. A config can redirect the schema, replace the datasource URLs, or stop Prisma loading `.env`. The repo uses none of these. They run without a flag only when every URL they use is:

- a local Postgres (`localhost`, `127.0.0.1`, `::1`), or
- a Neon host whose endpoint id is listed in `MARKMASTER_DEV_ENDPOINT_IDS`, **and** `MARKMASTER_PROD_ENDPOINT_ID` is set and is different.

Everything else is refused and nothing is written: the prod endpoint, a missing URL, a Neon endpoint in neither list, any other remote host, an unparseable URL, a URL with `?host=`/`?hostaddr=`/`?port=` or `${...}`, or any Neon host while `MARKMASTER_PROD_ENDPOINT_ID` is unset. The refusal names hosts and endpoint ids only, never the URL or password.

To write to prod on purpose:

```bash
npm run db:migrate -- --prod
npm run embeddings:backfill -- --prod
npm run embeddings:backfill-images -- --prod
npm run embeddings:image-scores -- --prod "your query"
# or, for any of them:
MARKMASTER_ALLOW_PROD=1 npm run db:migrate
```

`MARKMASTER_ALLOW_PROD` counts only when it is set in the shell or process that launches the script. It never goes in `.env`, `.env.local`, or `prisma/.env`: a value there is ignored, so it cannot become a permanent, silent override.

The flag also overrides an unknown host, so use it only when you have checked the target. A Vercel build that runs `npm run deploy:build` against prod needs `MARKMASTER_ALLOW_PROD=1` in that environment, or the build stops before migrating.

The guard is only as accurate as `MARKMASTER_PROD_ENDPOINT_ID` and `MARKMASTER_DEV_ENDPOINT_IDS`. If the prod id is wrong (a typo, or an id from another project) and the real prod endpoint is listed as dev, prod is treated as dev and writes go through. Copy both ids from the Neon console and re-check them after any branch or compute change.

The guard covers the npm scripts above. Calling `npx prisma migrate deploy`, `prisma migrate reset`, or `prisma db push` directly skips it.

Endpoint ids are the first part of a Neon hostname, without `-pooler`: in `ep-example-name-a1b2c3d4-pooler.c-6.us-east-1.aws.neon.tech` the id is `ep-example-name-a1b2c3d4`. They identify a branch's compute and are not credentials, but they stay in local env files rather than in the repo.

### Set up jdry for dev (one time)

1. Open https://console.neon.tech, pick the MarkMaster project, and click **Connect** on the project dashboard.
2. In the connection dialog, set **Branch** to `dev`, keep the database (`neondb`) and role, and leave **Connection pooling** on. Copy the string. This is `DATABASE_URL`.
3. Turn **Connection pooling** off and copy again. This is `DIRECT_URL` (same host without `-pooler`).
4. Put both in `.env` in the repo on jdry, replacing the prod values. Prisma reads `.env` and then `prisma/.env` (the first file to set a variable wins), and the scripts read `.env`. If `prisma/.env` exists, remove its database lines. If `.env.local` also exists, `next dev` reads it first, so set the same two dev values there or remove the database lines from it.
5. Add the endpoint ids to `.env`:
   - `MARKMASTER_DEV_ENDPOINT_IDS`: the `ep-...` id from the `dev` hostname you just copied.
   - `MARKMASTER_PROD_ENDPOINT_ID`: in the console, open **Branches** → `production` and copy the `ep-...` id of its compute (or switch the Connect dialog to `production` and read it off the hostname, without copying the password).
6. Check the targets without printing a password:

   ```bash
   node --input-type=module -e 'import { resolvePrismaEnv } from "./scripts/db-target-guard.mjs"; const { env, files } = resolvePrismaEnv(); console.log("files:", files.join(", ") || "none"); for (const key of ["DATABASE_URL","DIRECT_URL"]) { const value = env[key]; if (!value) { console.log(key, "MISSING"); continue; } const url = new URL(value); console.log(key, url.hostname + url.pathname); }'
   ```

   Both lines should show the `dev` endpoint id.

Never paste a connection string into an issue, PR, chat, or commit. `.env*` is gitignored except `.env.example`.

### Reset dev from production

When an experiment leaves `dev` in a bad state, reset it to a fresh copy of `production`. This discards everything on `dev` (data and schema) and is instant; `production` is not touched, and the `dev` connection strings and endpoint id stay the same.

- Console: **Branches** → `dev` → **Reset from parent**.
- CLI: `neon branches reset dev --parent --project-id <project id>` (`neonctl` is the same CLI).
- API: `POST /projects/{project_id}/branches/{dev_branch_id}/restore` with `{"source_branch_id": "<production branch id>"}`.

After a reset, `dev` has prod's schema, so re-run `npm run db:migrate`, `npm run embeddings:backfill`, and `npm run embeddings:backfill-images` there for any migration that is not on prod yet.

## Commands on this machine

### 1. Install Ollama and pull the model

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull embeddinggemma-2:270m
ollama list
```

Leave the Ollama server running (`ollama serve` if it is not already a service). Set `OLLAMA_MAX_LOADED_MODELS` to at least 2 in that server's environment so the text model and the vision model can stay loaded together. With one slot, each switch costs about 1.4–1.7 seconds. Embed calls send `keep_alive` of `30m` by default (`OLLAMA_EMBED_KEEP_ALIVE`), so a loaded model stays resident for half an hour instead of Ollama's five-minute default, and is not pinned until restart.

### 2. Environment

In `.env`, alongside the existing database URLs (pointing at `dev`, see "Two databases" above):

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434
EMBEDDING_MODEL=embeddinggemma-2:270m
```

`OLLAMA_BASE_URL` defaults to `http://127.0.0.1:11434`. `EMBEDDING_MODEL` defaults to `embeddinggemma-2:270m`. Both `DATABASE_URL` and `DIRECT_URL` are required. See `docs/DATABASE.md`.

### 3. Migrate

`npm run db:migrate` runs `prisma migrate deploy` behind the prod guard. It applies every pending migration, including `CREATE EXTENSION vector`, to the database in `DIRECT_URL`, and refuses prod unless run with `-- --prod`.

Run it only after you have confirmed that URL is the intended database, and on prod only with an explicit yes from the owner. Print the host and database name, not the password:

```bash
node --input-type=module -e 'import { resolvePrismaEnv } from "./scripts/db-target-guard.mjs"; const { env, files } = resolvePrismaEnv(); console.log("files:", files.join(", ") || "none"); for (const key of ["DATABASE_URL","DIRECT_URL"]) { const value = env[key]; if (!value) { console.log(key, "MISSING"); continue; } const url = new URL(value); console.log(key, url.hostname + url.pathname); }'
```

When that output is the database you mean to change:

```bash
npm run db:migrate
```

To undo this migration after it has been applied, do not use `prisma migrate resolve --rolled-back`. That flag is only for a migration that failed partway. On an applied migration, Prisma 6.19 errors with "not in a failed state". Dropping the table and then running `--rolled-back` leaves `_prisma_migrations` recorded as applied, so a later deploy never recreates the table. The `vector` extension can stay.

**Preferred.** Add a new forward migration whose SQL is:

```sql
DROP TABLE "BookmarkEmbedding";
```

In that same change, remove `model BookmarkEmbedding` and the `embeddings BookmarkEmbedding[]` relation on `Bookmark` from `prisma/schema.prisma`. CI's migrations job runs `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code`. A dropped table with the model still in the schema fails that check.

Prisma Client does not read this table (`embedding` is `Unsupported`, and nothing uses `prisma.bookmarkEmbedding`). `mode=smart` reads it with raw SQL in `src/lib/smart-bookmark-search.ts`. A missing table is caught and the handler falls back to the keyword list (`search.fallback` is `no_embeddings`). Default search does not query the table, so that file can stay. `npm run embeddings:backfill` (`src/lib/embedding-backfill-store.ts`) reads and writes the table with no fallback, so the command fails after the drop. The migrations job also runs `src/lib/bookmark-embedding.pgvector.test.ts` with `RUN_PGVECTOR_TESTS=1`, which inserts and selects the same table. Remove or disable the backfill script, the store, and that test in the same change, or the backfill command and the migrations job fail. `npm run embeddings:demo` does not use the database.

Apply the migration the normal way (`npm run db:migrate`, which is `prisma migrate deploy`) after confirming `DIRECT_URL`.

**Manual.** Drop the table, then delete the applied migration row:

```sql
DROP TABLE "BookmarkEmbedding";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261018000000_add_bookmark_embedding';
```

A later `npm run db:migrate` will apply `20261018000000_add_bookmark_embedding` again.

### 4. Backfill

With Ollama running and `DATABASE_URL` pointing at the database you just migrated (dev by default; add `-- --prod` for prod):

```bash
npm run embeddings:backfill
```

The script prints `embedded`, `skipped`, `model`, and `dims`. A second run skips rows whose hash still matches.

Every row records which model made it and its size: `BookmarkEmbedding` has `model` and `dims` columns, and `(bookmarkId, model, dims)` is the primary key. The backfill only reads rows for the configured `EMBEDDING_MODEL` and 768 dimensions, so after a model change it re-embeds every bookmark under the new model and leaves the old model's rows alone. Smart search reads only rows for the configured model and dims. The `embedding` column is `vector(768)`, so a model with a different dimension needs a schema migration first. It embeds every bookmark in that database, in batches of 16.

### 5. Image search

Image rows live in `BookmarkImageEmbedding`, keyed by bookmark, image URL (`mediaKey`), model, and dims. Photos use the media URL. Videos and GIFs use the thumbnail (`preview_image_url`, otherwise a non-video `url`), never the MP4. Link-card images on `urls` are included only when the URL is on the fetch allowlist below. Each row stores `model` and `dims` the same way text rows do. The backfill skips a row whose content hash is already stored for that model and dimension, deletes rows for images that are no longer on the bookmark, and leaves a different model's rows alone.

The fetcher allows only `https://pbs.twimg.com`, `https://video.twimg.com`, and `https://ton.twimg.com` (exact host, no userinfo, no other port, no IP literal). It uses `redirect: "manual"` and checks every hop against that same list, following at most 3 redirects. A redirect to loopback or any other host is refused and not fetched. Images on other hosts, including link-card images, are dropped before the backfill and are not fetched.

`OLLAMA_BASE_URL` is the same variable as text search (default `http://127.0.0.1:11434`). The new variable is `EMBEDDING_IMAGE_MODEL` (default `embeddinggemma-2:440m-q8_0-text-vision`).

The vision model runs on CPU on Linux. Pull it before the backfill. On Jonny's Linux machine, with `DATABASE_URL` and `DIRECT_URL` pointed at the dev Neon branch (see "Set up jdry for dev" above):

```bash
ollama pull embeddinggemma-2:440m-q8_0-text-vision
ollama list
```

Confirm the host is the dev branch. This prints the hostname and database name, not the password:

```bash
node --input-type=module -e 'import { resolvePrismaEnv } from "./scripts/db-target-guard.mjs"; const { env, files } = resolvePrismaEnv(); console.log("files:", files.join(", ") || "none"); for (const key of ["DATABASE_URL","DIRECT_URL"]) { const value = env[key]; if (!value) { console.log(key, "MISSING"); continue; } const url = new URL(value); console.log(key, url.hostname + url.pathname); }'
```

When both lines show the dev endpoint id:

```bash
npm run db:migrate
npm run embeddings:backfill-images
```

`npm run db:migrate` applies pending migrations, including `prisma/migrations/20261021000000_add_bookmark_image_embedding/migration.sql` (`BookmarkImageEmbedding` and `BookmarkImageEmbedFailure`). The image backfill fetches each allowlisted image (15s timeout), skips a dead URL or a non-image response, and logs that URL and status only (`image-embedding skip <url> <status>`). A failure is stored on `BookmarkImageEmbedFailure` (`failCount`, `lastError`, `lastFailedAt`). `lastError` is a short status token, not a response body. The next run skips that URL until `IMAGE_EMBED_FAILURE_RETRY_DAYS` (7) have passed, then tries again. A success removes the failure row. A different model has its own rows. A second run also skips images already embedded with the same model. It refuses the prod host unless you pass `-- --prod` or `MARKMASTER_ALLOW_PROD=1` in the shell. Do not put that flag in an env file.

Optional, in `.env` on that machine:

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434
EMBEDDING_IMAGE_MODEL=embeddinggemma-2:440m-q8_0-text-vision
SMART_SEARCH_EMBED_TIMEOUT_MS=4000
IMAGE_HIT_SIMILARITY_CUTOFF=0.68
OLLAMA_EMBED_KEEP_ALIVE=30m
```

`SMART_SEARCH_EMBED_TIMEOUT_MS` is the query-embed cap in milliseconds (default 4000, clamped to 1–30000). `npm run embeddings:image-scores` uses 30000 when the variable is unset. `IMAGE_HIT_SIMILARITY_CUTOFF` must be in `(0, 1)`; `0` and `1` fall back to 0.68. `OLLAMA_EMBED_KEEP_ALIVE` is the duration sent as `keep_alive` (default `30m`). A duration outside 1s–24h, `-1`, and `0` are ignored. `IMAGE_HIT_SCORE_OFFSET` (0.03) and `DUAL_MATCH_SCORE_BONUS` (0.02) are code constants in `src/lib/smart-search-merge.ts`, not environment variables. The 60-second pause after a query-embed timeout has no environment variable. `OLLAMA_MAX_LOADED_MODELS` is set on the Ollama process, not in this app's env.

The backfill prints `embedded`, `skipped`, `failed`, `deferred`, `removed`, `model`, and `dims`. `failed` is the number of URLs recorded this run. `deferred` is a recent failure left until the 7-day retry.

### Calibration

Checked on the dev library on 2026-10-21. 1,317 image embeddings from `embeddinggemma-2:440m-q8_0-text-vision`. Text embeddings are `embeddinggemma-2:270m`. 16 real queries and 2 controls. Figures below are aggregates; individual queries are not listed.

Image cosine. The two control queries topped out at 0.647 and 0.630 (99th percentile 0.61 and 0.58). Real queries' best image hit was 0.659–0.804 (median 0.744). On review, a score of 0.70 or higher was nearly always the right bookmark, 0.65–0.68 was mixed, and a score under 0.65 was nearly always wrong.

Text cosine. The top hit was 0.639–0.782. The 10th hit was 0.590–0.718 (median about 0.64). The median bookmark for a query was 0.52–0.63, so a text cosine near 0.60 is close to the noise.

The previous cutoff of 0.65 and `IMAGE_HIT_SCORE_WEIGHT` of 0.5 never put an image-only bookmark in the top 10 for those real queries. The cutoff is now 0.68, above the controls and the mixed band under 0.68. The 0.03 offset is fitted from that library so an image cosine can be compared with a text cosine; the two models do not share a scale. A 0.74 image scores 0.71 and ranks above a 0.64 text hit, a 0.85 image scores 0.82 and ranks above a 0.60 text hit, and a 0.70 image scores 0.67 and loses to a 0.92 text hit. A 0.651 image hit is below the cutoff and is dropped.

To record raw cosine similarities for a list of queries (no writes), after the backfill:

```bash
npm run embeddings:image-scores -- "rust ownership" "sourdough starter"
```

Pass every query as its own argument. The command embeds every text query first, then every image query, so each model loads once. It prints the cutoff, the image score offset (`IMAGE_HIT_SCORE_OFFSET`, 0.03), and the top 10 text rows and top 10 image rows as `similarity = 1 - distance`. Its embed cap defaults to 30000 milliseconds and uses `SMART_SEARCH_EMBED_TIMEOUT_MS` when that variable is set. It only runs `SELECT`. It refuses a prod URL the same way the backfill does.

To undo the image tables later, add a forward migration whose SQL drops `BookmarkImageEmbedFailure` and `BookmarkImageEmbedding`, and remove both models plus the `imageEmbeddings` and `imageEmbedFailures` relations from `prisma/schema.prisma` in that same change. The text table is separate.

### 6. Try it

Start the app (`npm run dev`) and sign in, then request:

```text
/api/bookmarks?search=YOUR+QUERY&mode=smart
```

`search.fallback` is `null` when the fused ranking was used.

### Demo without a database

Export bookmarks while signed in (`GET /api/export?format=json`) or pass any JSON array / `{ "bookmarks": [...] }` with the same fields. The export includes text, author, tags, and note. The database backfill also includes link titles and quoted tweets when those columns are set.

```bash
npm run embeddings:demo -- ./bookmarks.json "rust ownership" "sourdough starter"
```

Ollama must be running. The script embeds the file in memory and prints the keyword top 5 and the smart top 5 for each query. It does not read or write the database.
