import { beforeEach, describe, expect, it, vi } from "vitest";

import { imageContentHash } from "./bookmark-image-sources";
import type { EmbeddingBackfillBookmark, EmbeddingBackfillStore, StoredEmbedding } from "./embedding-backfill";
import { EMBEDDING_DIMS, EmbeddingProviderError, type EmbeddingProvider, type ImageEmbedder } from "./embedding-provider";
import type {
  ImageBackfillBookmark,
  ImageEmbeddingBackfillStore,
  ImageEmbedFailure,
  StoredImageEmbedding,
} from "./image-embedding-backfill";

const listTextBookmarks = vi.hoisted(() => vi.fn(async () => []));
const listTextExisting = vi.hoisted(() => vi.fn(async () => []));
const upsertText = vi.hoisted(() => vi.fn(async () => undefined));
const listImageBookmarks = vi.hoisted(() => vi.fn(async () => []));
const listImageExisting = vi.hoisted(() => vi.fn(async () => []));
const deleteAbsentImages = vi.hoisted(() => vi.fn(async () => 0));
const upsertImages = vi.hoisted(() => vi.fn(async () => undefined));
const listImageFailures = vi.hoisted(() => vi.fn(async () => []));
const recordImageFailure = vi.hoisted(() => vi.fn(async () => undefined));
const clearImageFailure = vi.hoisted(() => vi.fn(async () => undefined));
const deleteAbsentImageFailures = vi.hoisted(() => vi.fn(async () => 0));

vi.mock("@/lib/embedding-backfill-store", () => ({
  listBookmarksForEmbedding: (...args: unknown[]) => listTextBookmarks(...args),
  listExistingEmbeddingHashes: (...args: unknown[]) => listTextExisting(...args),
  upsertBookmarkEmbeddings: (...args: unknown[]) => upsertText(...args),
}));

vi.mock("@/lib/image-embedding-backfill-store", () => ({
  listBookmarksForImageEmbedding: (...args: unknown[]) => listImageBookmarks(...args),
  listExistingImageEmbeddings: (...args: unknown[]) => listImageExisting(...args),
  deleteAbsentImageEmbeddings: (...args: unknown[]) => deleteAbsentImages(...args),
  upsertBookmarkImageEmbeddings: (...args: unknown[]) => upsertImages(...args),
  listImageEmbedFailures: (...args: unknown[]) => listImageFailures(...args),
  recordImageEmbedFailure: (...args: unknown[]) => recordImageFailure(...args),
  clearImageEmbedFailure: (...args: unknown[]) => clearImageFailure(...args),
  deleteAbsentImageEmbedFailures: (...args: unknown[]) => deleteAbsentImageFailures(...args),
}));

import {
  embedBookmarksAfterSync,
  imageEmbeddingStoreForUser,
  SYNC_EMBED_BUDGET_MS,
  SYNC_EMBED_IMAGE_LIMIT,
  SYNC_EMBED_TEXT_LIMIT,
  textEmbeddingStoreForUser,
} from "./sync-embed";

const GOOD = "https://pbs.twimg.com/photo.jpg";
const SECOND = "https://video.twimg.com/second.jpg";

function textBookmark(id: string, note: string | null = null): EmbeddingBackfillBookmark {
  return {
    bookmarkId: id,
    tweetText: `text ${id}`,
    authorUsername: "ada",
    authorDisplayName: "Ada",
    urls: null,
    quotedTweet: null,
    tagNames: [],
    note,
  };
}

function imageBookmark(id: string, urls: string[]): ImageBackfillBookmark {
  return {
    bookmarkId: id,
    images: urls.map((url) => ({ mediaKey: url, url, contentHash: imageContentHash(url) })),
  };
}

function textProvider(): EmbeddingProvider & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    model: "embeddinggemma-2:270m",
    dims: EMBEDDING_DIMS,
    calls,
    async embed(texts) {
      calls.push([...texts]);
      return texts.map(() => Array.from({ length: EMBEDDING_DIMS }, () => 0.1));
    },
  };
}

function imageEmbedder(): ImageEmbedder & { calls: number } {
  return {
    model: "embeddinggemma-2:440m-q8_0-text-vision",
    dims: EMBEDDING_DIMS,
    calls: 0,
    async embedImages(images) {
      this.calls += 1;
      return images.map(() => Array.from({ length: EMBEDDING_DIMS }, () => 0.2));
    },
  };
}

function textStore(bookmarks: EmbeddingBackfillBookmark[]): EmbeddingBackfillStore & {
  rows: StoredEmbedding[];
} {
  const rows: StoredEmbedding[] = [];
  return {
    rows,
    async listBookmarks() {
      return bookmarks;
    },
    async listExisting(model, dims) {
      return rows
        .filter((row) => row.model === model && row.dims === dims)
        .map((row) => ({ bookmarkId: row.bookmarkId, contentHash: row.contentHash }));
    },
    async upsert(batch) {
      for (const row of batch) {
        const index = rows.findIndex(
          (existing) =>
            existing.bookmarkId === row.bookmarkId && existing.model === row.model && existing.dims === row.dims
        );
        if (index === -1) rows.push(row);
        else rows[index] = row;
      }
    },
  };
}

function imageStore(bookmarks: ImageBackfillBookmark[]): ImageEmbeddingBackfillStore & {
  rows: StoredImageEmbedding[];
} {
  const rows: StoredImageEmbedding[] = [];
  const failures: ImageEmbedFailure[] = [];
  return {
    rows,
    async listBookmarks() {
      return bookmarks;
    },
    async listExisting(model, dims) {
      return rows
        .filter((row) => row.model === model && row.dims === dims)
        .map((row) => ({ bookmarkId: row.bookmarkId, mediaKey: row.mediaKey, contentHash: row.contentHash }));
    },
    async deleteAbsent() {
      return 0;
    },
    async upsert(batch) {
      rows.push(...batch);
    },
    async listFailures() {
      return failures;
    },
    async recordFailure() {
      return undefined;
    },
    async clearFailure() {
      return undefined;
    },
    async deleteAbsentFailures() {
      return 0;
    },
  };
}

function ready(overrides: NonNullable<Parameters<typeof embedBookmarksAfterSync>[1]> = {}) {
  return {
    env: { OLLAMA_BASE_URL: "http://127.0.0.1:11434" },
    healthCheck: vi.fn(async () => true),
    fetchImage: vi.fn(async () => ({ ok: true as const, base64: "aGVsbG8=" })),
    ...overrides,
    log: overrides.log ?? vi.fn(),
  };
}

describe("embedBookmarksAfterSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("embeds a new bookmark's text and image", async () => {
    const texts = textStore([textBookmark("new-1")]);
    const images = imageStore([imageBookmark("new-1", [GOOD])]);
    const provider = textProvider();
    const embedder = imageEmbedder();
    const options = ready({
      textStore: texts,
      imageStore: images,
      textProvider: provider,
      imageEmbedder: embedder,
    });

    await embedBookmarksAfterSync("user-1", options);

    expect(texts.rows).toHaveLength(1);
    expect(texts.rows[0]?.bookmarkId).toBe("new-1");
    expect(images.rows).toHaveLength(1);
    expect(images.rows[0]).toMatchObject({ bookmarkId: "new-1", mediaKey: GOOD });
    expect(provider.calls[0]?.[0]).toContain("text new-1");
    expect(embedder.calls).toBe(1);
    expect(options.log).not.toHaveBeenCalled();
  });

  it("leaves the pass successful when the provider is down", async () => {
    const provider = textProvider();
    const embedder = imageEmbedder();
    const unreachable = ready({
      textStore: textStore([textBookmark("new-1")]),
      imageStore: imageStore([imageBookmark("new-1", [GOOD])]),
      textProvider: provider,
      imageEmbedder: embedder,
      healthCheck: vi.fn(async () => false),
    });

    await expect(embedBookmarksAfterSync("user-1", unreachable)).resolves.toBeUndefined();
    expect(provider.calls).toHaveLength(0);
    expect(embedder.calls).toBe(0);
    expect(unreachable.log).toHaveBeenCalledTimes(1);
    expect(unreachable.log).toHaveBeenCalledWith("warn", "skipped: embedding provider is unreachable");

    const failing = textProvider();
    failing.embed = vi.fn(async () => {
      throw new EmbeddingProviderError("provider_unavailable");
    });
    const down = ready({
      textStore: textStore([textBookmark("new-1")]),
      imageStore: imageStore([]),
      textProvider: failing,
      imageEmbedder: imageEmbedder(),
    });
    await expect(embedBookmarksAfterSync("user-1", down)).resolves.toBeUndefined();
    expect(down.log).toHaveBeenCalledTimes(1);
    expect(down.log).toHaveBeenCalledWith("error", "embedding provider unavailable");
  });

  it("skips unchanged text and image rows", async () => {
    const texts = textStore([textBookmark("same")]);
    const images = imageStore([imageBookmark("same", [GOOD])]);
    const provider = textProvider();
    const embedder = imageEmbedder();
    const options = ready({
      textStore: texts,
      imageStore: images,
      textProvider: provider,
      imageEmbedder: embedder,
    });

    await embedBookmarksAfterSync("user-1", options);
    await embedBookmarksAfterSync("user-1", options);

    expect(provider.calls).toHaveLength(1);
    expect(embedder.calls).toBe(1);
    expect(texts.rows).toHaveLength(1);
    expect(images.rows).toHaveLength(1);
  });

  it("respects the row cap and the deadline", async () => {
    const provider = textProvider();
    const embedder = imageEmbedder();
    const fetchImage = vi.fn(async () => ({ ok: true as const, base64: "aGVsbG8=" }));
    const capped = ready({
      textStore: textStore(["a", "b", "c"].map((id) => textBookmark(id))),
      imageStore: imageStore([imageBookmark("a", [GOOD, SECOND])]),
      textProvider: provider,
      imageEmbedder: embedder,
      fetchImage,
      textLimit: 1,
      imageLimit: 1,
    });

    await embedBookmarksAfterSync("user-1", capped);
    expect(provider.calls).toEqual([[expect.stringContaining("text a")]]);
    expect(embedder.calls).toBe(1);
    expect(fetchImage).toHaveBeenCalledTimes(1);

    const lateProvider = textProvider();
    const lateEmbedder = imageEmbedder();
    const lateFetch = vi.fn(async () => ({ ok: true as const, base64: "aGVsbG8=" }));
    await embedBookmarksAfterSync(
      "user-1",
      ready({
        textStore: textStore([textBookmark("late")]),
        imageStore: imageStore([imageBookmark("late", [GOOD])]),
        textProvider: lateProvider,
        imageEmbedder: lateEmbedder,
        fetchImage: lateFetch,
        deadlineAt: 0,
      })
    );
    expect(lateProvider.calls).toHaveLength(0);
    expect(lateEmbedder.calls).toBe(0);
    expect(lateFetch).not.toHaveBeenCalled();

    const slow = textProvider();
    slow.embed = vi.fn(async (_texts, _kind, options) => {
      expect(options?.timeoutMs).toBeLessThanOrEqual(40);
      throw new EmbeddingProviderError("timeout");
    });
    const timed = ready({
      textStore: textStore([textBookmark("slow")]),
      imageStore: imageStore([]),
      textProvider: slow,
      imageEmbedder: imageEmbedder(),
      textTimeoutMs: 40,
      deadlineAt: Date.now() + 60_000,
    });
    await expect(embedBookmarksAfterSync("user-1", timed)).resolves.toBeUndefined();
    expect(timed.log).toHaveBeenCalledTimes(1);
    expect(timed.log).toHaveBeenCalledWith("error", "embedding pass timed out");
  });

  it("pins the sync embed budget defaults", () => {
    expect(SYNC_EMBED_BUDGET_MS).toBe(60_000);
    expect(SYNC_EMBED_TEXT_LIMIT).toBe(128);
    expect(SYNC_EMBED_IMAGE_LIMIT).toBe(16);
  });

  it("warns with counts when a deadline-clamped embed times out", async () => {
    const embedder = imageEmbedder();
    let imageCalls = 0;
    embedder.embedImages = async (images, options) => {
      imageCalls += 1;
      expect(options?.timeoutMs).toBeLessThan(8_000);
      expect(options?.timeoutMs).toBeGreaterThan(1_500);
      if (imageCalls === 2) throw new EmbeddingProviderError("timeout");
      return images.map(() => Array.from({ length: EMBEDDING_DIMS }, () => 0.2));
    };
    const options = ready({
      textStore: textStore([textBookmark("a")]),
      imageStore: imageStore([imageBookmark("a", [GOOD, SECOND])]),
      textProvider: textProvider(),
      imageEmbedder: embedder,
      imageTimeoutMs: 8_000,
      deadlineAt: Date.now() + 5_000,
    });

    await embedBookmarksAfterSync("user-1", options);

    expect(imageCalls).toBe(2);
    expect(options.log).toHaveBeenCalledTimes(1);
    expect(options.log).toHaveBeenCalledWith("warn", "stopped at budget: text 1, images 1");
  });

  it("reports a provider timeout as an error when the deadline did not clamp the call", async () => {
    const provider = textProvider();
    provider.embed = vi.fn(async (_texts, _kind, options) => {
      expect(options?.timeoutMs).toBe(8_000);
      throw new EmbeddingProviderError("timeout");
    });
    const options = ready({
      textStore: textStore([textBookmark("slow")]),
      imageStore: imageStore([]),
      textProvider: provider,
      imageEmbedder: imageEmbedder(),
      textTimeoutMs: 8_000,
      deadlineAt: Date.now() + 60_000,
    });

    await embedBookmarksAfterSync("user-1", options);

    expect(options.log).toHaveBeenCalledTimes(1);
    expect(options.log).toHaveBeenCalledWith("error", "embedding pass timed out");
  });

  it("does not start an image embed in the last 1.5s and counts it as a budget stop", async () => {
    const provider = textProvider();
    const embedder = imageEmbedder();
    const fetchImage = vi.fn(async () => ({ ok: true as const, base64: "aGVsbG8=" }));
    const options = ready({
      textStore: textStore([textBookmark("late")]),
      imageStore: imageStore([imageBookmark("late", [GOOD])]),
      textProvider: provider,
      imageEmbedder: embedder,
      fetchImage,
      deadlineAt: Date.now() + 1_000,
    });

    await embedBookmarksAfterSync("user-1", options);

    expect(provider.calls).toHaveLength(1);
    expect(embedder.calls).toBe(0);
    expect(fetchImage).not.toHaveBeenCalled();
    expect(options.log).toHaveBeenCalledTimes(1);
    expect(options.log).toHaveBeenCalledWith("warn", "stopped at budget: text 1, images 0");
  });

  it("skips the pass when OLLAMA_BASE_URL is not set", async () => {
    const provider = textProvider();
    const healthCheck = vi.fn(async () => true);
    const log = vi.fn();
    await embedBookmarksAfterSync("user-1", {
      env: {},
      healthCheck,
      log,
      textStore: textStore([textBookmark("new-1")]),
      textProvider: provider,
      imageStore: imageStore([imageBookmark("new-1", [GOOD])]),
      imageEmbedder: imageEmbedder(),
    });
    await embedBookmarksAfterSync("user-1", {
      env: { OLLAMA_BASE_URL: "   " },
      healthCheck,
      log,
      textProvider: provider,
      imageEmbedder: imageEmbedder(),
    });

    expect(healthCheck).not.toHaveBeenCalled();
    expect(provider.calls).toHaveLength(0);
    expect(log).not.toHaveBeenCalled();
  });

  it("logs one line and omits ids, urls, and connection strings", async () => {
    const log = vi.fn();
    const provider = textProvider();
    provider.embed = vi.fn(async () => {
      throw new Error(
        "postgres://user:pw@ep-prod.neon.tech/db bookmark bk_123 https://pbs.twimg.com/x.jpg http://user:s3cret@127.0.0.1:11434"
      );
    });
    await embedBookmarksAfterSync(
      "user-1",
      ready({
        log,
        textStore: textStore([textBookmark("bk_123")]),
        imageStore: imageStore([imageBookmark("bk_123", [GOOD])]),
        textProvider: provider,
        imageEmbedder: imageEmbedder(),
      })
    );

    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.stringify(log.mock.calls);
    expect(line).toContain("embedding pass failed");
    expect(line).not.toMatch(/postgres|bk_123|twimg|s3cret|neon\.tech/);
  });
});

describe("user-scoped embedding stores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the synced user through to text and image queries", async () => {
    const text = textEmbeddingStoreForUser("user-1");
    await text.listBookmarks();
    await text.listExisting("embeddinggemma-2:270m", 768);
    expect(listTextBookmarks).toHaveBeenCalledWith("user-1");
    expect(listTextExisting).toHaveBeenCalledWith("embeddinggemma-2:270m", 768, "user-1");

    const images = imageEmbeddingStoreForUser("user-1");
    await images.listBookmarks();
    await images.listExisting("vision", 768);
    await images.listFailures("vision", 768);
    await images.deleteAbsent("vision", 768, []);
    await images.deleteAbsentFailures("vision", 768, []);
    expect(listImageBookmarks).toHaveBeenCalledWith("user-1");
    expect(listImageExisting).toHaveBeenCalledWith("vision", 768, "user-1");
    expect(listImageFailures).toHaveBeenCalledWith("vision", 768, "user-1");
    expect(deleteAbsentImages).toHaveBeenCalledWith("vision", 768, [], "user-1");
    expect(deleteAbsentImageFailures).toHaveBeenCalledWith("vision", 768, [], "user-1");
  });

  it("refuses a blank user id", () => {
    expect(() => textEmbeddingStoreForUser("  ")).toThrow(/userId is required/);
    expect(() => imageEmbeddingStoreForUser("")).toThrow(/userId is required/);
  });
});
