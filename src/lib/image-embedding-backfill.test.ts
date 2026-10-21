import { afterEach, describe, expect, it, vi } from "vitest";

import { EMBEDDING_DIMS, EmbeddingProviderError, type ImageEmbedder } from "./embedding-provider";
import {
  backfillBookmarkImageEmbeddings,
  fetchImageAsBase64,
  selectStaleImageEmbeddings,
  type ImageBackfillBookmark,
  type ImageEmbeddingBackfillStore,
  type StoredImageEmbedding,
} from "./image-embedding-backfill";
import { imageContentHash } from "./bookmark-image-sources";

const JPEG = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9);
const GOOD = "https://cdn.example/photo.jpg";
const DEAD = "https://cdn.example/missing.jpg";
const HTML = "https://cdn.example/page";

function bookmark(
  id: string,
  urls: string[]
): ImageBackfillBookmark {
  return {
    bookmarkId: id,
    images: urls.map((url) => ({
      mediaKey: url,
      url,
      contentHash: imageContentHash(url),
    })),
  };
}

function fakeEmbedder(model = "embeddinggemma-2:440m-q8_0-text-vision"): ImageEmbedder & {
  calls: string[][];
} {
  const calls: string[][] = [];
  return {
    model,
    dims: EMBEDDING_DIMS,
    calls,
    async embedImages(images) {
      calls.push([...images]);
      return images.map(() => Array.from({ length: EMBEDDING_DIMS }, () => 0.1));
    },
  };
}

function fakeStore(bookmarks: ImageBackfillBookmark[]): ImageEmbeddingBackfillStore & {
  rows: Map<string, StoredImageEmbedding>;
  bookmarks: ImageBackfillBookmark[];
} {
  const rows = new Map<string, StoredImageEmbedding>();
  return {
    rows,
    bookmarks,
    async listBookmarks() {
      return bookmarks;
    },
    async listExisting(model, dims) {
      return [...rows.values()]
        .filter((row) => row.model === model && row.dims === dims)
        .map((row) => ({
          bookmarkId: row.bookmarkId,
          mediaKey: row.mediaKey,
          contentHash: row.contentHash,
        }));
    },
    async deleteAbsent(model, dims, keep) {
      const keepKeys = new Set(keep.map((row) => `${row.bookmarkId}\0${row.mediaKey}`));
      let removed = 0;
      for (const [key, row] of rows) {
        if (row.model !== model || row.dims !== dims) continue;
        if (keepKeys.has(`${row.bookmarkId}\0${row.mediaKey}`)) continue;
        rows.delete(key);
        removed += 1;
      }
      return removed;
    },
    async upsert(batch) {
      for (const row of batch) {
        rows.set(`${row.bookmarkId}\0${row.mediaKey}\0${row.model}\0${row.dims}`, row);
      }
    },
  };
}

function okImage(url: string): Response {
  if (url === DEAD) return new Response("missing", { status: 404 });
  if (url === HTML) {
    return new Response("<html></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return new Response(JPEG, { status: 200, headers: { "content-type": "image/jpeg" } });
}

describe("selectStaleImageEmbeddings", () => {
  it("skips a row already stored for the same media item and hash", () => {
    const target = {
      bookmarkId: "a",
      mediaKey: GOOD,
      url: GOOD,
      contentHash: imageContentHash(GOOD),
    };
    const result = selectStaleImageEmbeddings(
      [target, { ...target, bookmarkId: "b", contentHash: "changed" }],
      [
        { bookmarkId: "a", mediaKey: GOOD, contentHash: target.contentHash },
        { bookmarkId: "b", mediaKey: GOOD, contentHash: "old" },
      ]
    );
    expect(result.skipped).toBe(1);
    expect(result.stale.map((row) => row.bookmarkId)).toEqual(["b"]);
  });
});

describe("backfillBookmarkImageEmbeddings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips dead URLs and non-image responses and embeds the rest", async () => {
    vi.stubGlobal("fetch", (url: string) => Promise.resolve(okImage(String(url))));
    const store = fakeStore([bookmark("a", [DEAD, HTML, GOOD])]);
    const embedder = fakeEmbedder();
    const skipped: Array<{ url: string; status: string }> = [];

    const counts = await backfillBookmarkImageEmbeddings({
      store,
      embedder,
      onSkip: (event) => skipped.push(event),
    });

    expect(skipped).toEqual([
      { url: DEAD, status: "404" },
      { url: HTML, status: "non-image" },
    ]);
    expect(embedder.calls).toHaveLength(1);
    expect(store.rows.size).toBe(1);
    expect(counts).toMatchObject({
      embedded: 1,
      skipped: 0,
      failed: 2,
      model: "embeddinggemma-2:440m-q8_0-text-vision",
      dims: EMBEDDING_DIMS,
    });
    expect([...store.rows.values()][0]).toMatchObject({
      bookmarkId: "a",
      mediaKey: GOOD,
      model: "embeddinggemma-2:440m-q8_0-text-vision",
      dims: EMBEDDING_DIMS,
    });
  });

  it("is idempotent for the same model and retries a URL that was not stored", async () => {
    vi.stubGlobal("fetch", (url: string) => Promise.resolve(okImage(String(url))));
    const store = fakeStore([bookmark("a", [GOOD, DEAD])]);
    const embedder = fakeEmbedder();

    const first = await backfillBookmarkImageEmbeddings({ store, embedder });
    expect(first).toMatchObject({ embedded: 1, skipped: 0, failed: 1 });
    expect(embedder.calls).toHaveLength(1);

    const second = await backfillBookmarkImageEmbeddings({ store, embedder });
    expect(second).toMatchObject({ embedded: 0, skipped: 1, failed: 1 });
    expect(embedder.calls).toHaveLength(1);

    const swapped = fakeEmbedder("other-vision-model");
    const third = await backfillBookmarkImageEmbeddings({ store, embedder: swapped });
    expect(third).toMatchObject({ embedded: 1, skipped: 0, model: "other-vision-model" });
    expect(store.rows.size).toBe(2);

    store.bookmarks[0] = bookmark("a", [GOOD]);
    const pruned = await backfillBookmarkImageEmbeddings({ store, embedder });
    expect(pruned.removed).toBe(0);
    expect([...store.rows.keys()].some((key) => key.includes(DEAD))).toBe(false);
    expect(pruned).toMatchObject({ embedded: 0, skipped: 1 });
  });

  it("drops an image row when the media item is gone", async () => {
    const store = fakeStore([bookmark("a", [GOOD])]);
    const embedder = fakeEmbedder();
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response(JPEG, { status: 200, headers: { "content-type": "image/jpeg" } }))
    );
    await backfillBookmarkImageEmbeddings({ store, embedder });
    store.bookmarks[0] = bookmark("a", []);
    const counts = await backfillBookmarkImageEmbeddings({ store, embedder });
    expect(counts.removed).toBe(1);
    expect(store.rows.size).toBe(0);
    expect(embedder.calls).toHaveLength(1);
  });

  it("aborts when the embedding server times out and continues after one bad image", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response(JPEG, { status: 200, headers: { "content-type": "image/jpeg" } }))
    );
    const store = fakeStore([bookmark("a", [GOOD, "https://cdn.example/second.jpg"])]);
    let calls = 0;
    const embedder: ImageEmbedder = {
      model: "embeddinggemma-2:440m-q8_0-text-vision",
      dims: EMBEDDING_DIMS,
      async embedImages() {
        calls += 1;
        if (calls === 1) throw new EmbeddingProviderError("provider_unavailable");
        return [Array.from({ length: EMBEDDING_DIMS }, () => 0.2)];
      },
    };
    const skipped: string[] = [];
    const counts = await backfillBookmarkImageEmbeddings({
      store,
      embedder,
      onSkip: (event) => skipped.push(event.status),
    });
    expect(counts).toMatchObject({ embedded: 1, failed: 1 });
    expect(skipped).toEqual(["embed-failed"]);

    const timingOut: ImageEmbedder = {
      ...embedder,
      async embedImages() {
        throw new EmbeddingProviderError("timeout");
      },
    };
    await expect(
      backfillBookmarkImageEmbeddings({ store, embedder: timingOut })
    ).rejects.toMatchObject({ reason: "timeout" });
  });
});

describe("fetchImageAsBase64", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("times out a hanging image fetch", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        })
    );
    await expect(fetchImageAsBase64("https://cdn.example/slow.jpg", 20)).resolves.toEqual({
      ok: false,
      url: "https://cdn.example/slow.jpg",
      status: "timeout",
    });
  });

  it("does not fetch a loopback URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchImageAsBase64("http://127.0.0.1/secret.jpg", 20)).resolves.toEqual({
      ok: false,
      url: "http://127.0.0.1/secret.jpg",
      status: "unsupported",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
