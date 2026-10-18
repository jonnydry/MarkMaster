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

The prefixes are the search pair published on the model card and in the sentence-transformers prompt table (`Retrieval-query` / `SearchQuery`, and `Retrieval-document` / `Document`):

- https://ai.google.dev/gemma/docs/embeddinggemma/model_card_2
- https://ai.google.dev/gemma/docs/embeddinggemma/inference-embeddinggemma-with-sentence-transformers
- https://huggingface.co/google/embeddinggemma-2

Ollama embeds the string it is given. This app adds the prefixes. Bookmarks have no single title, so documents use `title: none`. Link titles, quoted text, tags, and the note are inside the document body.

Queries and stored vectors must use this same model and 768 dimensions.

## What smart search does

`GET /api/bookmarks?search=...&mode=smart`

1. Embed the raw search string as a query (1.5s timeout). Repeat queries for the same model and text reuse an in-memory cache.
2. Take the closest 50 stored vectors by pgvector cosine distance (`<=>`), with the current filters (user, tags, dates, collection, author, media, unaffiliated, raw).
3. Take the keyword hits from the same ILIKE terms as today, and keep the first 200 in the request's `sortField` / `sortDirection` (default `bookmarkedAt desc`). Those 200 are the first rows in that sort order, not the best ILIKE matches: a later row is dropped even when its text matches more closely. The default keyword list is not capped.
4. Score each id with Reciprocal Rank Fusion, k = 60: `1/(60+rank)` from each list, ranks starting at 1.
5. Return that order, paged with `page` and `limit`.

The response adds:

```json
"search": { "mode": "smart", "fallback": null, "model": "embeddinggemma-2:270m", "dims": 768, "vectorHits": 50, "keywordHits": 12 }
```

If Ollama is unreachable, the call times out, or this user has no rows for the configured model and dimensions, the handler returns today's keyword list and sets `search.fallback` to `provider_unavailable`, `timeout`, or `no_embeddings`. An empty search sets `empty_query` and returns the normal list.

There is no library toggle. Pagination for a fused result uses `page` and `limit`. The keyset `cursor` is for the default list.

New and edited bookmarks stay unembedded until the backfill runs again. The script skips rows whose content hash is unchanged.

The migration creates `BookmarkEmbedding` and runs `CREATE EXTENSION IF NOT EXISTS vector`. It does not add an HNSW or IVFFlat index. Retrieval is an exact scan.

## Commands on this machine

### 1. Install Ollama and pull the model

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull embeddinggemma-2:270m
ollama list
```

Leave the Ollama server running (`ollama serve` if it is not already a service).

### 2. Environment

In `.env`, alongside the existing database URLs:

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434
EMBEDDING_MODEL=embeddinggemma-2:270m
```

`OLLAMA_BASE_URL` defaults to `http://127.0.0.1:11434`. `EMBEDDING_MODEL` defaults to `embeddinggemma-2:270m`. Both `DATABASE_URL` and `DIRECT_URL` are required. See `docs/DATABASE.md`.

### 3. Migrate

`npm run db:migrate` is `prisma migrate deploy`. It applies every pending migration, including `CREATE EXTENSION vector`, to the database in `DIRECT_URL`.

Run it only after you have confirmed that URL is the intended database, and only with an explicit yes from the owner. Print the host and database name, not the password:

```bash
node -e 'for (const key of ["DATABASE_URL","DIRECT_URL"]) { const value = process.env[key]; if (!value) { console.log(key, "MISSING"); continue; } const url = new URL(value); console.log(key, url.hostname + url.pathname); }'
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

With Ollama running and `DATABASE_URL` pointing at the database you just migrated:

```bash
npm run embeddings:backfill
```

The script prints `embedded`, `skipped`, `model`, and `dims`. A second run skips rows whose hash still matches. It embeds every bookmark in that database, in batches of 16.

### 5. Try it

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
