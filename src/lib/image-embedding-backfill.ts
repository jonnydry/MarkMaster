import { EmbeddingProviderError, type ImageEmbedder } from "@/lib/embedding-provider";
import {
  IMAGE_FETCH_MAX_REDIRECTS,
  isAllowlistedImageUrl,
} from "@/lib/image-fetch-allowlist";

export const IMAGE_FETCH_TIMEOUT_MS = 15_000;
export const IMAGE_EMBED_TIMEOUT_MS = 120_000;
export const IMAGE_BYTE_LIMIT = 8 * 1024 * 1024;

/** Don't start an image embed the shared deadline would abort. Ollama logs that abort as HTTP 400. */
const IMAGE_EMBED_MIN_REMAINING_MS = 1_500;

/** A recorded image failure is retried after this many days, not on the next run. */
export const IMAGE_EMBED_FAILURE_RETRY_DAYS = 7;

export type ImageBackfillTarget = {
  bookmarkId: string;
  mediaKey: string;
  url: string;
  contentHash: string;
};

export type StoredImageEmbedding = {
  bookmarkId: string;
  mediaKey: string;
  model: string;
  dims: number;
  embedding: number[];
  contentHash: string;
};

export type ImageBackfillBookmark = {
  bookmarkId: string;
  images: Array<Omit<ImageBackfillTarget, "bookmarkId">>;
};

export interface ImageEmbeddingBackfillStore {
  listBookmarks(): Promise<ImageBackfillBookmark[]>;
  listExisting(
    model: string,
    dims: number
  ): Promise<Array<{ bookmarkId: string; mediaKey: string; contentHash: string }>>;
  deleteAbsent(
    model: string,
    dims: number,
    keep: Array<{ bookmarkId: string; mediaKey: string }>
  ): Promise<number>;
  upsert(rows: StoredImageEmbedding[]): Promise<void>;
  listFailures(model: string, dims: number): Promise<ImageEmbedFailure[]>;
  recordFailure(row: ImageEmbedFailureWrite): Promise<void>;
  clearFailure(bookmarkId: string, mediaKey: string, model: string, dims: number): Promise<void>;
  deleteAbsentFailures(
    model: string,
    dims: number,
    keep: Array<{ bookmarkId: string; mediaKey: string }>
  ): Promise<number>;
}

export type ImageEmbedFailure = {
  bookmarkId: string;
  mediaKey: string;
  failCount: number;
  lastFailedAt: Date;
};

export type ImageEmbedFailureWrite = {
  bookmarkId: string;
  mediaKey: string;
  model: string;
  dims: number;
  status: string;
  failedAt: Date;
};

export type ImageFetchSuccess = { ok: true; base64: string };
export type ImageFetchFailure = { ok: false; url: string; status: string };
export type ImageFetchOutcome = ImageFetchSuccess | ImageFetchFailure;

export type ImageFetcher = (url: string, timeoutMs: number) => Promise<ImageFetchOutcome>;

export type ImageBackfillCounts = {
  embedded: number;
  skipped: number;
  failed: number;
  /** Recent failures left untouched until {@link IMAGE_EMBED_FAILURE_RETRY_DAYS}. */
  deferred: number;
  removed: number;
  /** True when the loop stopped because the deadline left too little time. */
  budgetStopped: boolean;
  model: string;
  dims: number;
};

export function selectStaleImageEmbeddings(
  targets: readonly ImageBackfillTarget[],
  existing: readonly { bookmarkId: string; mediaKey: string; contentHash: string }[]
): { stale: ImageBackfillTarget[]; skipped: number } {
  const hashes = new Map(
    existing.map((row) => [imageRowKey(row.bookmarkId, row.mediaKey), row.contentHash])
  );
  const stale: ImageBackfillTarget[] = [];
  let skipped = 0;
  for (const target of targets) {
    if (hashes.get(imageRowKey(target.bookmarkId, target.mediaKey)) === target.contentHash) {
      skipped += 1;
    } else {
      stale.push(target);
    }
  }
  return { stale, skipped };
}

function imageRowKey(bookmarkId: string, mediaKey: string): string {
  return `${bookmarkId}\0${mediaKey}`;
}

/**
 * Embed media images that are missing or whose hash changed.
 * A second run with the same model skips rows already stored for that model.
 * A failed URL is recorded and left alone until {@link IMAGE_EMBED_FAILURE_RETRY_DAYS} have passed.
 * `limit` caps how many stale images this call fetches. Rows still cooling down
 * do not count. `deadlineAt` is an epoch millisecond time; a fetch does not
 * start once that time has passed, and each fetch and embed timeout is clamped
 * to the time remaining. An image embed does not start when 1.5s or less remains.
 */
export async function backfillBookmarkImageEmbeddings(options: {
  store: ImageEmbeddingBackfillStore;
  embedder: ImageEmbedder;
  fetchImage?: ImageFetcher;
  timeoutMs?: number;
  fetchTimeoutMs?: number;
  now?: () => Date;
  onSkip?: (event: { url: string; status: string }) => void;
  limit?: number;
  deadlineAt?: number;
}): Promise<ImageBackfillCounts> {
  const fetchImage = options.fetchImage ?? fetchImageAsBase64;
  const timeoutMs = options.timeoutMs ?? IMAGE_EMBED_TIMEOUT_MS;
  const fetchTimeoutMs = options.fetchTimeoutMs ?? IMAGE_FETCH_TIMEOUT_MS;
  const now = options.now ?? (() => new Date());
  const retryMs = IMAGE_EMBED_FAILURE_RETRY_DAYS * 24 * 60 * 60 * 1000;
  const limit = resolveEmbedLimit(options.limit);
  const { embedder, store, onSkip } = options;

  const bookmarks = await store.listBookmarks();
  const targets = bookmarks.flatMap((bookmark) =>
    bookmark.images.map((image) => ({ bookmarkId: bookmark.bookmarkId, ...image }))
  );
  const keep = targets.map((target) => ({ bookmarkId: target.bookmarkId, mediaKey: target.mediaKey }));
  const removed = await store.deleteAbsent(embedder.model, embedder.dims, keep);
  await store.deleteAbsentFailures(embedder.model, embedder.dims, keep);
  const existing = await store.listExisting(embedder.model, embedder.dims);
  const { stale, skipped } = selectStaleImageEmbeddings(targets, existing);
  const failures = await store.listFailures(embedder.model, embedder.dims);
  const failureByKey = new Map(
    failures.map((row) => [imageRowKey(row.bookmarkId, row.mediaKey), row])
  );

  let embedded = 0;
  let failed = 0;
  let deferred = 0;
  let attempted = 0;
  let budgetStopped = false;
  for (const target of stale) {
    const prior = failureByKey.get(imageRowKey(target.bookmarkId, target.mediaKey));
    if (prior && failureStillCooling(prior.lastFailedAt, now(), retryMs)) {
      deferred += 1;
      continue;
    }
    if (attempted >= limit) break;
    if (deadlineTooTightForImageEmbed(options.deadlineAt)) {
      budgetStopped = true;
      break;
    }
    const fetchBudget = timeoutWithinDeadline(fetchTimeoutMs, options.deadlineAt);
    if (fetchBudget === null) {
      budgetStopped = true;
      break;
    }
    attempted += 1;

    const fetched = await fetchImage(target.url, fetchBudget);
    if (!fetched.ok) {
      failed += 1;
      await store.recordFailure({
        bookmarkId: target.bookmarkId,
        mediaKey: target.mediaKey,
        model: embedder.model,
        dims: embedder.dims,
        status: fetched.status,
        failedAt: now(),
      });
      onSkip?.({ url: fetched.url, status: fetched.status });
      continue;
    }

    const embedBudget = imageEmbedTimeout(timeoutMs, options.deadlineAt);
    if (embedBudget === null) {
      budgetStopped = true;
      break;
    }

    try {
      const vectors = await embedder.embedImages([fetched.base64], { timeoutMs: embedBudget });
      const vector = vectors.length === 1 ? vectors[0] : undefined;
      if (!vector) {
        throw new Error("Embedding provider returned a different number of vectors than images");
      }
      await store.upsert([
        {
          bookmarkId: target.bookmarkId,
          mediaKey: target.mediaKey,
          model: embedder.model,
          dims: embedder.dims,
          embedding: vector,
          contentHash: target.contentHash,
        },
      ]);
      await store.clearFailure(target.bookmarkId, target.mediaKey, embedder.model, embedder.dims);
      embedded += 1;
    } catch (error) {
      if (error instanceof EmbeddingProviderError && error.reason === "timeout") {
        if (embedBudget < timeoutMs) {
          budgetStopped = true;
          break;
        }
        throw error;
      }
      if (!(error instanceof EmbeddingProviderError)) throw error;
      failed += 1;
      await store.recordFailure({
        bookmarkId: target.bookmarkId,
        mediaKey: target.mediaKey,
        model: embedder.model,
        dims: embedder.dims,
        status: "embed-failed",
        failedAt: now(),
      });
      onSkip?.({ url: target.url, status: "embed-failed" });
    }
  }

  return {
    embedded,
    skipped,
    failed,
    deferred,
    removed,
    budgetStopped,
    model: embedder.model,
    dims: embedder.dims,
  };
}

function resolveEmbedLimit(limit: number | undefined): number {
  if (limit === undefined) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error("limit must be at least 1");
  }
  return Math.floor(limit);
}

/** Timeout for the next fetch, or null when the deadline has passed. */
function timeoutWithinDeadline(capMs: number, deadlineAt?: number): number | null {
  if (deadlineAt === undefined) return capMs;
  const remaining = deadlineAt - Date.now();
  if (remaining < 1) return null;
  return Math.min(capMs, remaining);
}

function deadlineTooTightForImageEmbed(deadlineAt?: number): boolean {
  if (deadlineAt === undefined) return false;
  return deadlineAt - Date.now() <= IMAGE_EMBED_MIN_REMAINING_MS;
}

/** Embed timeout, or null when 1.5s or less remains so the request is not aborted. */
function imageEmbedTimeout(capMs: number, deadlineAt?: number): number | null {
  if (deadlineTooTightForImageEmbed(deadlineAt)) return null;
  return timeoutWithinDeadline(capMs, deadlineAt);
}

function failureStillCooling(lastFailedAt: Date, now: Date, retryMs: number): boolean {
  const failedAt = lastFailedAt instanceof Date ? lastFailedAt.getTime() : new Date(lastFailedAt).getTime();
  return Number.isFinite(failedAt) && now.getTime() - failedAt < retryMs;
}

const MEDIA_IMAGE_PATH = /^\/media\/([^/.]+)\.(jpe?g|png|webp)$/i;

/**
 * X photo URLs (`pbs.twimg.com/media/<id>.<ext>`) are fetched at `name=small`.
 * The stored source URL is unchanged. Other hosts and paths are returned as-is.
 */
function smallMediaFetchUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "pbs.twimg.com") return null;
  const match = MEDIA_IMAGE_PATH.exec(parsed.pathname);
  if (!match) return null;
  const ext = match[2].toLowerCase() === "jpeg" ? "jpg" : match[2].toLowerCase();
  return `https://pbs.twimg.com/media/${match[1]}?format=${ext}&name=small`;
}

export async function fetchImageAsBase64(
  url: string,
  timeoutMs = IMAGE_FETCH_TIMEOUT_MS
): Promise<ImageFetchOutcome> {
  const loggedUrl = loggableUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const small = smallMediaFetchUrl(url);
    if (small) {
      const fetched = await fetchAllowlistedImage(small, controller, loggedUrl);
      if (fetched.ok || !shouldFallbackToOriginal(fetched, controller)) return fetched;
    }
    return await fetchAllowlistedImage(url, controller, loggedUrl);
  } finally {
    clearTimeout(timer);
  }
}

function shouldFallbackToOriginal(result: ImageFetchFailure, controller: AbortController): boolean {
  if (controller.signal.aborted || result.status === "timeout") return false;
  if (result.status === "non-image" || result.status === "error") return true;
  return /^\d{3}$/.test(result.status);
}

async function fetchAllowlistedImage(
  url: string,
  controller: AbortController,
  loggedUrl: string
): Promise<ImageFetchOutcome> {
  try {
    let current = url;
    for (let redirectsFollowed = 0; ; ) {
      if (!isAllowlistedImageUrl(current)) {
        return { ok: false, url: loggedUrl, status: "unsupported" };
      }

      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
          "User-Agent": "MarkMaster/image-embedding",
        },
      });

      if (isRedirectStatus(response.status)) {
        const next = redirectTarget(current, response.headers.get("location"));
        await response.body?.cancel().catch(() => undefined);
        if (!next || redirectsFollowed >= IMAGE_FETCH_MAX_REDIRECTS) {
          return { ok: false, url: loggedUrl, status: "unsupported" };
        }
        current = next;
        redirectsFollowed += 1;
        continue;
      }

      return await readFetchedImage(response, loggedUrl);
    }
  } catch (error) {
    if (isTimeoutError(error) || controller.signal.aborted) {
      return { ok: false, url: loggedUrl, status: "timeout" };
    }
    return { ok: false, url: loggedUrl, status: "error" };
  }
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function redirectTarget(current: string, location: string | null): string | null {
  if (!location) return null;
  try {
    return new URL(location, current).toString();
  } catch {
    return null;
  }
}

async function readFetchedImage(response: Response, loggedUrl: string): Promise<ImageFetchOutcome> {
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, url: loggedUrl, status: String(response.status) };
  }

  const declared = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > IMAGE_BYTE_LIMIT) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, url: loggedUrl, status: "too-large" };
  }

  const bytes = await readCappedBytes(response, IMAGE_BYTE_LIMIT);
  if (!bytes) return { ok: false, url: loggedUrl, status: "too-large" };
  if (!isImagePayload(response.headers.get("content-type"), bytes)) {
    return { ok: false, url: loggedUrl, status: "non-image" };
  }
  return { ok: true, base64: Buffer.from(bytes).toString("base64") };
}

export function loggableUrl(raw: string): string {
  const flattened = raw.replace(/[\u0000-\u001f\u007f]/g, "");
  try {
    const url = new URL(flattened);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return flattened;
  }
}

function isImagePayload(contentType: string | null, bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const mime = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime.startsWith("image/")) return true;
  if (mime === "" || mime === "application/octet-stream" || mime === "binary/octet-stream") {
    return sniffedImageType(bytes) !== null;
  }
  return false;
}

function sniffedImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

async function readCappedBytes(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    return buffer.byteLength > maxBytes ? null : new Uint8Array(buffer);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  return name === "TimeoutError" || name === "AbortError";
}
