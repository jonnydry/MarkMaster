import { isIP } from "node:net";

import { EmbeddingProviderError, type ImageEmbedder } from "@/lib/embedding-provider";

export const IMAGE_FETCH_TIMEOUT_MS = 15_000;
export const IMAGE_EMBED_TIMEOUT_MS = 120_000;
export const IMAGE_BYTE_LIMIT = 8 * 1024 * 1024;

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
}

export type ImageFetchSuccess = { ok: true; base64: string };
export type ImageFetchFailure = { ok: false; url: string; status: string };
export type ImageFetchOutcome = ImageFetchSuccess | ImageFetchFailure;

export type ImageFetcher = (url: string, timeoutMs: number) => Promise<ImageFetchOutcome>;

export type ImageBackfillCounts = {
  embedded: number;
  skipped: number;
  failed: number;
  removed: number;
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
 * Dead URLs and non-image responses are logged and left unstored, so a later run retries them.
 */
export async function backfillBookmarkImageEmbeddings(options: {
  store: ImageEmbeddingBackfillStore;
  embedder: ImageEmbedder;
  fetchImage?: ImageFetcher;
  timeoutMs?: number;
  fetchTimeoutMs?: number;
  onSkip?: (event: { url: string; status: string }) => void;
}): Promise<ImageBackfillCounts> {
  const fetchImage = options.fetchImage ?? fetchImageAsBase64;
  const timeoutMs = options.timeoutMs ?? IMAGE_EMBED_TIMEOUT_MS;
  const fetchTimeoutMs = options.fetchTimeoutMs ?? IMAGE_FETCH_TIMEOUT_MS;
  const { embedder, store, onSkip } = options;

  const bookmarks = await store.listBookmarks();
  const targets = bookmarks.flatMap((bookmark) =>
    bookmark.images.map((image) => ({ bookmarkId: bookmark.bookmarkId, ...image }))
  );
  const removed = await store.deleteAbsent(
    embedder.model,
    embedder.dims,
    targets.map((target) => ({ bookmarkId: target.bookmarkId, mediaKey: target.mediaKey }))
  );
  const existing = await store.listExisting(embedder.model, embedder.dims);
  const { stale, skipped } = selectStaleImageEmbeddings(targets, existing);

  let embedded = 0;
  let failed = 0;
  for (const target of stale) {
    const fetched = await fetchImage(target.url, fetchTimeoutMs);
    if (!fetched.ok) {
      failed += 1;
      onSkip?.({ url: fetched.url, status: fetched.status });
      continue;
    }

    try {
      const vectors = await embedder.embedImages([fetched.base64], { timeoutMs });
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
      embedded += 1;
    } catch (error) {
      if (!(error instanceof EmbeddingProviderError) || error.reason === "timeout") throw error;
      failed += 1;
      onSkip?.({ url: target.url, status: "embed-failed" });
    }
  }

  return {
    embedded,
    skipped,
    failed,
    removed,
    model: embedder.model,
    dims: embedder.dims,
  };
}

export async function fetchImageAsBase64(
  url: string,
  timeoutMs = IMAGE_FETCH_TIMEOUT_MS
): Promise<ImageFetchOutcome> {
  const loggedUrl = loggableUrl(url);
  if (!isFetchableImageUrl(url)) {
    return { ok: false, url: loggedUrl, status: "unsupported" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
        "User-Agent": "MarkMaster/image-embedding",
      },
    });

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
  } catch (error) {
    if (isTimeoutError(error) || controller.signal.aborted) {
      return { ok: false, url: loggedUrl, status: "timeout" };
    }
    return { ok: false, url: loggedUrl, status: "error" };
  } finally {
    clearTimeout(timer);
  }
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

function isFetchableImageUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  return !isBlockedHost(url.hostname);
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (isIP(host) === 0) return false;
  return isPrivateOrUnroutableIp(host);
}

function isPrivateOrUnroutableIp(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) return true;

  const v4 = lower.startsWith("::ffff:") ? lower.slice("::ffff:".length) : lower;
  const parts = v4.split(".");
  if (parts.length !== 4) return false;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const a = numbers[0] ?? 0;
  const b = numbers[1] ?? 0;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
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
