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

  it("embeds at most limit rows and does not start a batch after the deadline", async () => {
    const bookmarks = ["a", "b", "c"].map((id) => bookmark(id));
    const provider = fakeProvider();
    const capped = await backfillBookmarkEmbeddings({
      store: fakeStore(bookmarks),
      provider,
      batchSize: 10,
      limit: 1,
    });
    expect(capped.embedded).toBe(1);
    expect(capped.skipped).toBe(0);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toHaveLength(1);

    const stopped = fakeProvider();
    const afterDeadline = await backfillBookmarkEmbeddings({
      store: fakeStore(bookmarks),
      provider: stopped,
      deadlineAt: 0,
    });
    expect(afterDeadline.embedded).toBe(0);
    expect(stopped.calls).toHaveLength(0);

    const seen: number[] = [];
    const timed: EmbeddingProvider = {
      model: "embeddinggemma-2:270m",
      dims: EMBEDDING_DIMS,
      async embed(texts, _kind, options) {
        seen.push(options?.timeoutMs ?? -1);
        return texts.map(() => Array.from({ length: EMBEDDING_DIMS }, () => 0));
      },
    };
    await backfillBookmarkEmbeddings({
      store: fakeStore([bookmark("a")]),
      provider: timed,
      timeoutMs: 50_000,
      deadlineAt: Date.now() + 30_000,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeGreaterThan(1_000);
    expect(seen[0]).toBeLessThanOrEqual(30_000);

    await expect(
      backfillBookmarkEmbeddings({
        store: fakeStore([bookmark("a")]),
        provider: fakeProvider(),
        limit: 0,
      })
    ).rejects.toThrow(/limit must be at least 1/);
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
