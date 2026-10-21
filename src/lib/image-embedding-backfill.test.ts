import { afterEach, describe, expect, it, vi } from "vitest";

import { EMBEDDING_DIMS, EmbeddingProviderError, type ImageEmbedder } from "./embedding-provider";
import {
  backfillBookmarkImageEmbeddings,
  fetchImageAsBase64,
  IMAGE_EMBED_FAILURE_RETRY_DAYS,
  selectStaleImageEmbeddings,
  type ImageBackfillBookmark,
  type ImageEmbedFailure,
  type ImageEmbeddingBackfillStore,
  type StoredImageEmbedding,
} from "./image-embedding-backfill";
import { imageContentHash } from "./bookmark-image-sources";

const JPEG = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9);
const GOOD = "https://pbs.twimg.com/photo.jpg";
const DEAD = "https://pbs.twimg.com/missing.jpg";
const HTML = "https://pbs.twimg.com/page";
const SECOND = "https://video.twimg.com/second.jpg";

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

function failureKey(bookmarkId: string, mediaKey: string, model: string, dims: number): string {
  return `${bookmarkId}\0${mediaKey}\0${model}\0${dims}`;
}

function fakeStore(bookmarks: ImageBackfillBookmark[]): ImageEmbeddingBackfillStore & {
  rows: Map<string, StoredImageEmbedding>;
  failures: Map<string, ImageEmbedFailure & { model: string; dims: number; status: string }>;
  bookmarks: ImageBackfillBookmark[];
} {
  const rows = new Map<string, StoredImageEmbedding>();
  const failures = new Map<string, ImageEmbedFailure & { model: string; dims: number; status: string }>();
  return {
    rows,
    failures,
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
    async listFailures(model, dims) {
      return [...failures.values()]
        .filter((row) => row.model === model && row.dims === dims)
        .map((row) => ({
          bookmarkId: row.bookmarkId,
          mediaKey: row.mediaKey,
          failCount: row.failCount,
          lastFailedAt: row.lastFailedAt,
        }));
    },
    async recordFailure(row) {
      const key = failureKey(row.bookmarkId, row.mediaKey, row.model, row.dims);
      const existing = failures.get(key);
      failures.set(key, {
        bookmarkId: row.bookmarkId,
        mediaKey: row.mediaKey,
        model: row.model,
        dims: row.dims,
        status: row.status,
        failCount: (existing?.failCount ?? 0) + 1,
        lastFailedAt: row.failedAt,
      });
    },
    async clearFailure(bookmarkId, mediaKey, model, dims) {
      failures.delete(failureKey(bookmarkId, mediaKey, model, dims));
    },
    async deleteAbsentFailures(model, dims, keep) {
      const keepKeys = new Set(keep.map((row) => `${row.bookmarkId}\0${row.mediaKey}`));
      let removed = 0;
      for (const [key, row] of failures) {
        if (row.model !== model || row.dims !== dims) continue;
        if (keepKeys.has(`${row.bookmarkId}\0${row.mediaKey}`)) continue;
        failures.delete(key);
        removed += 1;
      }
      return removed;
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

  it("is idempotent for the same model and does not refetch a recent failure", async () => {
    let fetches = 0;
    vi.stubGlobal("fetch", (url: string) => {
      fetches += 1;
      return Promise.resolve(okImage(String(url)));
    });
    const store = fakeStore([bookmark("a", [GOOD, DEAD])]);
    const embedder = fakeEmbedder();
    const now = new Date("2026-01-01T00:00:00.000Z");

    const first = await backfillBookmarkImageEmbeddings({ store, embedder, now: () => now });
    expect(first).toMatchObject({ embedded: 1, skipped: 0, failed: 1, deferred: 0 });
    expect(embedder.calls).toHaveLength(1);
    expect(fetches).toBe(2);
    expect(store.failures.size).toBe(1);

    const second = await backfillBookmarkImageEmbeddings({ store, embedder, now: () => now });
    expect(second).toMatchObject({ embedded: 0, skipped: 1, failed: 0, deferred: 1 });
    expect(embedder.calls).toHaveLength(1);
    expect(fetches).toBe(2);

    const swapped = fakeEmbedder("other-vision-model");
    const third = await backfillBookmarkImageEmbeddings({
      store,
      embedder: swapped,
      now: () => now,
    });
    expect(third).toMatchObject({ embedded: 1, skipped: 0, failed: 1, model: "other-vision-model" });
    expect(store.rows.size).toBe(2);
    expect(fetches).toBe(4);

    store.bookmarks[0] = bookmark("a", [GOOD]);
    const pruned = await backfillBookmarkImageEmbeddings({ store, embedder, now: () => now });
    expect(pruned.removed).toBe(0);
    expect([...store.rows.keys()].some((key) => key.includes(DEAD))).toBe(false);
    expect([...store.failures.values()].some((row) => row.model === embedder.model && row.mediaKey === DEAD)).toBe(
      false
    );
    expect(pruned).toMatchObject({ embedded: 0, skipped: 1, deferred: 0 });
  });

  it("refetches a failed URL after the retry window", async () => {
    let fetches = 0;
    vi.stubGlobal("fetch", (url: string) => {
      fetches += 1;
      return Promise.resolve(okImage(String(url)));
    });
    const store = fakeStore([bookmark("a", [GOOD, DEAD])]);
    const embedder = fakeEmbedder();
    let now = new Date("2026-01-01T00:00:00.000Z");

    await backfillBookmarkImageEmbeddings({ store, embedder, now: () => now });
    expect(fetches).toBe(2);

    now = new Date(now.getTime() + IMAGE_EMBED_FAILURE_RETRY_DAYS * 24 * 60 * 60 * 1000);
    const retried = await backfillBookmarkImageEmbeddings({ store, embedder, now: () => now });
    expect(retried).toMatchObject({ embedded: 0, skipped: 1, failed: 1, deferred: 0 });
    expect(fetches).toBe(3);
    expect([...store.failures.values()][0]?.failCount).toBe(2);
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
    const store = fakeStore([bookmark("a", [GOOD, SECOND])]);
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
    const later = new Date(Date.now() + (IMAGE_EMBED_FAILURE_RETRY_DAYS + 1) * 24 * 60 * 60 * 1000);
    await expect(
      backfillBookmarkImageEmbeddings({ store, embedder: timingOut, now: () => later })
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
    await expect(fetchImageAsBase64("https://pbs.twimg.com/slow.jpg", 20)).resolves.toEqual({
      ok: false,
      url: "https://pbs.twimg.com/slow.jpg",
      status: "timeout",
    });
  });

  it.each([
    "https://[::ffff:7f00:1]/secret.jpg",
    "https://127.0.0.1/secret.jpg",
    "https://10.1.2.3/secret.jpg",
    "http://169.254.169.254/latest/meta-data",
    "https://cdn.example/photo.jpg",
  ])("does not fetch %s", async (url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchImageAsBase64(url, 20)).resolves.toMatchObject({
      ok: false,
      status: "unsupported",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches an allowlisted host", async () => {
    const fetchMock = vi.fn(async () => jpegResponse());
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchImageAsBase64("https://ton.twimg.com/card.jpg", 20)).resolves.toMatchObject({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });

  it("does not follow a redirect to loopback", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("127.0.0.1")) throw new Error("fetched loopback");
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/secret.jpg" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchImageAsBase64("https://pbs.twimg.com/photo.jpg", 20)).resolves.toEqual({
      ok: false,
      url: "https://pbs.twimg.com/photo.jpg",
      status: "unsupported",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not follow a redirect to a non-allowlisted host", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("example.com")) throw new Error("fetched example");
      return new Response(null, {
        status: 302,
        headers: { location: "https://example.com/a.jpg" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchImageAsBase64("https://video.twimg.com/thumb.jpg", 20)).resolves.toMatchObject({
      ok: false,
      status: "unsupported",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows an allowlisted redirect and stops after the hop cap", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/final.jpg")) return jpegResponse();
      return new Response(null, {
        status: 302,
        headers: { location: "https://pbs.twimg.com/final.jpg" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchImageAsBase64("https://pbs.twimg.com/start.jpg", 20)).resolves.toMatchObject({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockImplementation(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://pbs.twimg.com/again.jpg" },
      })
    );
    await expect(fetchImageAsBase64("https://pbs.twimg.com/loop.jpg", 20)).resolves.toMatchObject({
      ok: false,
      status: "unsupported",
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

function jpegResponse(): Response {
  return new Response(JPEG, { status: 200, headers: { "content-type": "image/jpeg" } });
}
