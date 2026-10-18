import type { EmbeddingProvider } from "@/lib/embedding-provider";
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
 */
export async function backfillBookmarkEmbeddings(options: {
  store: EmbeddingBackfillStore;
  provider: EmbeddingProvider;
  batchSize?: number;
  timeoutMs?: number;
}): Promise<EmbeddingBackfillCounts> {
  const batchSize = options.batchSize ?? EMBEDDING_BACKFILL_BATCH_SIZE;
  if (batchSize < 1) {
    throw new Error("batchSize must be at least 1");
  }
  const timeoutMs = options.timeoutMs ?? EMBEDDING_BACKFILL_TIMEOUT_MS;
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
  for (let offset = 0; offset < stale.length; offset += batchSize) {
    const batch = stale.slice(offset, offset + batchSize);
    const texts = batch.map((row) => textById.get(row.bookmarkId) ?? "");
    const vectors = await provider.embed(texts, "document", { timeoutMs });
    if (vectors.length !== batch.length) {
      throw new Error("Embedding provider returned a different number of vectors than texts");
    }
    await store.upsert(
      batch.map((row, index) => ({
        bookmarkId: row.bookmarkId,
        model: provider.model,
        dims: provider.dims,
        embedding: vectors[index] ?? [],
        contentHash: row.contentHash,
      }))
    );
    embedded += batch.length;
  }

  return {
    embedded,
    skipped,
    model: provider.model,
    dims: provider.dims,
  };
}
