import { describe, expect, it, vi } from "vitest";

import {
  backfillBookmarkEmbeddings,
  selectStaleEmbeddings,
  type EmbeddingBackfillBookmark,
  type EmbeddingBackfillStore,
  type StoredEmbedding,
} from "./embedding-backfill";
import { EMBEDDING_DIMS, type EmbeddingProvider } from "./embedding-provider";

function bookmark(id: string, note: string | null = null): EmbeddingBackfillBookmark {
  return {
    bookmarkId: id,
    tweetText: `text ${id}`,
    authorUsername: "ada",
    authorDisplayName: "Ada",
    urls: null,
    quotedTweet: null,
    tagNames: id === "b" ? ["rust"] : [],
    note,
  };
}

function fakeProvider(): EmbeddingProvider & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    model: "embeddinggemma-2:270m",
    dims: EMBEDDING_DIMS,
    calls,
    async embed(texts) {
      calls.push([...texts]);
      return texts.map((_, index) =>
        Array.from({ length: EMBEDDING_DIMS }, (_unused, dim) => (dim === 0 ? index + 1 : 0))
      );
    },
  };
}

function fakeStore(bookmarks: EmbeddingBackfillBookmark[]): EmbeddingBackfillStore & {
  rows: Map<string, StoredEmbedding>;
} {
  const rows = new Map<string, StoredEmbedding>();
  return {
    rows,
    async listBookmarks() {
      return bookmarks;
    },
    async listExisting(model, dims) {
      return [...rows.values()]
        .filter((row) => row.model === model && row.dims === dims)
        .map((row) => ({ bookmarkId: row.bookmarkId, contentHash: row.contentHash }));
    },
    async upsert(batch) {
      for (const row of batch) rows.set(`${row.bookmarkId}\0${row.model}\0${row.dims}`, row);
    },
  };
}

describe("selectStaleEmbeddings", () => {
  it("keeps rows whose hash is unchanged", () => {
    const result = selectStaleEmbeddings(
      [
        { bookmarkId: "a", contentHash: "same" },
        { bookmarkId: "b", contentHash: "new" },
      ],
      [
        { bookmarkId: "a", contentHash: "same" },
        { bookmarkId: "b", contentHash: "old" },
      ]
    );
    expect(result.skipped).toBe(1);
    expect(result.stale.map((row) => row.bookmarkId)).toEqual(["b"]);
  });
});

describe("backfillBookmarkEmbeddings", () => {
  it("embeds missing rows in batches and skips unchanged rows on the next run", async () => {
    const bookmarks = ["a", "b", "c", "d", "e"].map((id) => bookmark(id));
    const store = fakeStore(bookmarks);
    const provider = fakeProvider();

    const first = await backfillBookmarkEmbeddings({
      store,
      provider,
      batchSize: 2,
    });

    expect(first).toMatchObject({
      embedded: 5,
      skipped: 0,
      model: "embeddinggemma-2:270m",
      dims: EMBEDDING_DIMS,
    });
    expect(provider.calls.map((batch) => batch.length)).toEqual([2, 2, 1]);
    expect(store.rows.size).toBe(5);

    const second = await backfillBookmarkEmbeddings({
      store,
      provider,
      batchSize: 2,
    });

    expect(second.embedded).toBe(0);
    expect(second.skipped).toBe(5);
    expect(provider.calls).toHaveLength(3);

    bookmarks[1] = bookmark("b", "updated note");
    const third = await backfillBookmarkEmbeddings({
      store,
      provider,
      batchSize: 2,
    });

    expect(third.embedded).toBe(1);
    expect(third.skipped).toBe(4);
    expect(provider.calls).toHaveLength(4);
    expect(provider.calls[3]).toEqual([
      expect.stringContaining("note: updated note"),
    ]);
  });

  it("fails when the provider returns the wrong number of vectors", async () => {
    const provider: EmbeddingProvider = {
      model: "embeddinggemma-2:270m",
      dims: EMBEDDING_DIMS,
      embed: vi.fn(async () => []),
    };
    await expect(
      backfillBookmarkEmbeddings({
        store: fakeStore([bookmark("a")]),
        provider,
      })
    ).rejects.toThrow(/different number of vectors/);
  });
});

describe("embedding provenance", () => {
  it("stores the model and dimension on every row and re-embeds rows from another model", async () => {
    const bookmarks = ["a", "b"].map((id) => bookmark(id));
    const store = fakeStore(bookmarks);

    await backfillBookmarkEmbeddings({ store, provider: fakeProvider() });
    expect([...store.rows.values()].map((row) => [row.model, row.dims])).toEqual([
      ["embeddinggemma-2:270m", EMBEDDING_DIMS],
      ["embeddinggemma-2:270m", EMBEDDING_DIMS],
    ]);

    const swapped = { ...fakeProvider(), model: "some-other-embedder" };
    const afterSwap = await backfillBookmarkEmbeddings({ store, provider: swapped });
    expect(afterSwap).toMatchObject({ embedded: 2, skipped: 0, model: "some-other-embedder" });

    const again = await backfillBookmarkEmbeddings({ store, provider: fakeProvider() });
    expect(again).toMatchObject({ embedded: 0, skipped: 2 });
  });
});
