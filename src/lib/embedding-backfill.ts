import { EmbeddingProviderError, type EmbeddingProvider } from "@/lib/embedding-provider";
import {
  bookmarkEmbeddingDocument,
  type BookmarkEmbeddingSource,
} from "@/lib/bookmark-embedding-text";

export const EMBEDDING_BACKFILL_BATCH_SIZE = 16;
export const EMBEDDING_BACKFILL_TIMEOUT_MS = 120_000;

export type EmbeddingBackfillBookmark = BookmarkEmbeddingSource & {
  bookmarkId: string;
};

export type StoredEmbedding = {
  bookmarkId: string;
  model: string;
  dims: number;
  embedding: number[];
  contentHash: string;
};

export interface EmbeddingBackfillStore {
  listBookmarks(): Promise<EmbeddingBackfillBookmark[]>;
  listExisting(
    model: string,
    dims: number
  ): Promise<Array<{ bookmarkId: string; contentHash: string }>>;
  upsert(rows: StoredEmbedding[]): Promise<void>;
}

export type EmbeddingBackfillCounts = {
  embedded: number;
  skipped: number;
  /** True when the loop stopped because the deadline had already passed. */
  budgetStopped: boolean;
  model: string;
  dims: number;
};

export function selectStaleEmbeddings(
  documents: Array<{ bookmarkId: string; contentHash: string }>,
  existing: Array<{ bookmarkId: string; contentHash: string }>
): { stale: Array<{ bookmarkId: string; contentHash: string }>; skipped: number } {
  const hashes = new Map(existing.map((row) => [row.bookmarkId, row.contentHash]));
  const stale: Array<{ bookmarkId: string; contentHash: string }> = [];
  let skipped = 0;
  for (const document of documents) {
    if (hashes.get(document.bookmarkId) === document.contentHash) {
      skipped += 1;
    } else {
      stale.push(document);
    }
  }
  return { stale, skipped };
}

/**
 * Embed bookmarks whose stored hash is missing or no longer matches.
 * A second run with the same provider and unchanged bookmarks only skips.
 * `limit` caps how many stale rows this call embeds. `deadlineAt` is an epoch
 * millisecond time; a batch does not start once that time has passed, and the
 * provider timeout is clamped to the time remaining.
 */
export async function backfillBookmarkEmbeddings(options: {
  store: EmbeddingBackfillStore;
  provider: EmbeddingProvider;
  batchSize?: number;
  timeoutMs?: number;
  limit?: number;
  deadlineAt?: number;
}): Promise<EmbeddingBackfillCounts> {
  const batchSize = options.batchSize ?? EMBEDDING_BACKFILL_BATCH_SIZE;
  if (batchSize < 1) {
    throw new Error("batchSize must be at least 1");
  }
  const timeoutMs = options.timeoutMs ?? EMBEDDING_BACKFILL_TIMEOUT_MS;
  const limit = resolveEmbedLimit(options.limit);
  const { provider, store } = options;

  const bookmarks = await store.listBookmarks();
  const documents = bookmarks.map((bookmark) => ({
    bookmarkId: bookmark.bookmarkId,
    ...bookmarkEmbeddingDocument(bookmark),
  }));
  const existing = await store.listExisting(provider.model, provider.dims);
  const { stale, skipped } = selectStaleEmbeddings(documents, existing);
  const textById = new Map(documents.map((document) => [document.bookmarkId, document.text]));

  let embedded = 0;
  let budgetStopped = false;
  let index = 0;
  while (index < stale.length && embedded < limit) {
    const callTimeout = timeoutWithinDeadline(timeoutMs, options.deadlineAt);
    if (callTimeout === null) {
      budgetStopped = true;
      break;
    }
    const room = Math.min(batchSize, limit - embedded, stale.length - index);
    const batch = stale.slice(index, index + room);
    const texts = batch.map((row) => textById.get(row.bookmarkId) ?? "");
    let vectors: number[][];
    try {
      vectors = await provider.embed(texts, "document", { timeoutMs: callTimeout });
    } catch (error) {
      if (error instanceof EmbeddingProviderError && error.reason === "timeout") {
        throw Object.assign(error, { embedded });
      }
      throw error;
    }
    if (vectors.length !== batch.length) {
      throw new Error("Embedding provider returned a different number of vectors than texts");
    }
    await store.upsert(
      batch.map((row, vectorIndex) => ({
        bookmarkId: row.bookmarkId,
        model: provider.model,
        dims: provider.dims,
        embedding: vectors[vectorIndex] ?? [],
        contentHash: row.contentHash,
      }))
    );
    index += batch.length;
    embedded += batch.length;
  }

  return {
    embedded,
    skipped,
    budgetStopped,
    model: provider.model,
    dims: provider.dims,
  };
}

function resolveEmbedLimit(limit: number | undefined): number {
  if (limit === undefined) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error("limit must be at least 1");
  }
  return Math.floor(limit);
}

/** Timeout for the next provider call, or null when the deadline has passed. */
function timeoutWithinDeadline(capMs: number, deadlineAt?: number): number | null {
  if (deadlineAt === undefined) return capMs;
  const remaining = deadlineAt - Date.now();
  if (remaining < 1) return null;
  return Math.min(capMs, remaining);
}
