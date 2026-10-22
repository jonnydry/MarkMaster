import {
  backfillBookmarkEmbeddings,
  EMBEDDING_BACKFILL_BATCH_SIZE,
  type EmbeddingBackfillStore,
} from "@/lib/embedding-backfill";
import {
  listBookmarksForEmbedding,
  listExistingEmbeddingHashes,
  upsertBookmarkEmbeddings,
} from "@/lib/embedding-backfill-store";
import {
  checkOllamaReachable,
  createEmbeddingProvider,
  createOllamaImageEmbedder,
  EmbeddingProviderError,
  isOllamaConfigured,
  OLLAMA_HEALTH_TIMEOUT_MS,
  type EmbeddingProvider,
  type ImageEmbedder,
} from "@/lib/embedding-provider";
import {
  backfillBookmarkImageEmbeddings,
  type ImageEmbeddingBackfillStore,
  type ImageFetcher,
} from "@/lib/image-embedding-backfill";
import {
  clearImageEmbedFailure,
  deleteAbsentImageEmbedFailures,
  deleteAbsentImageEmbeddings,
  listBookmarksForImageEmbedding,
  listExistingImageEmbeddings,
  listImageEmbedFailures,
  recordImageEmbedFailure,
  upsertBookmarkImageEmbeddings,
} from "@/lib/image-embedding-backfill-store";
import { logError, logWarn } from "@/lib/logger";

/** Wall-clock cap for text and image embeds after one sync, excluding the health check. */
export const SYNC_EMBED_BUDGET_MS = 20_000;

/** Stale text rows embedded per sync. Further rows wait for the next sync. */
export const SYNC_EMBED_TEXT_LIMIT = 32;

/** Stale images fetched per sync. Cooling failures do not count. */
export const SYNC_EMBED_IMAGE_LIMIT = 8;

export const SYNC_EMBED_TEXT_TIMEOUT_MS = 8_000;
export const SYNC_EMBED_IMAGE_TIMEOUT_MS = 8_000;
export const SYNC_EMBED_IMAGE_FETCH_TIMEOUT_MS = 5_000;

export type SyncEmbedOptions = {
  env?: NodeJS.ProcessEnv;
  healthCheck?: (env: NodeJS.ProcessEnv, timeoutMs: number) => Promise<boolean>;
  healthTimeoutMs?: number;
  budgetMs?: number;
  deadlineAt?: number;
  textLimit?: number;
  imageLimit?: number;
  textTimeoutMs?: number;
  imageTimeoutMs?: number;
  imageFetchTimeoutMs?: number;
  textStore?: EmbeddingBackfillStore;
  imageStore?: ImageEmbeddingBackfillStore;
  textProvider?: EmbeddingProvider;
  imageEmbedder?: ImageEmbedder;
  fetchImage?: ImageFetcher;
  log?: (level: "warn" | "error", message: string) => void;
};

/**
 * Embed this user's new and changed bookmark text and images.
 * Best-effort: a missing Ollama config, a failed health check, or a provider
 * error is logged once and does not throw. The next sync or a manual backfill
 * picks up whatever this pass did not finish.
 */
export async function embedBookmarksAfterSync(
  userId: string,
  options: SyncEmbedOptions = {}
): Promise<void> {
  try {
    await runSyncEmbed(userId, options);
  } catch {
    report(options, "error", "embedding pass failed");
  }
}

export function textEmbeddingStoreForUser(userId: string): EmbeddingBackfillStore {
  assertUserId(userId);
  return {
    listBookmarks: () => listBookmarksForEmbedding(userId),
    listExisting: (model, dims) => listExistingEmbeddingHashes(model, dims, userId),
    upsert: upsertBookmarkEmbeddings,
  };
}

export function imageEmbeddingStoreForUser(userId: string): ImageEmbeddingBackfillStore {
  assertUserId(userId);
  return {
    listBookmarks: () => listBookmarksForImageEmbedding(userId),
    listExisting: (model, dims) => listExistingImageEmbeddings(model, dims, userId),
    deleteAbsent: (model, dims, keep) => deleteAbsentImageEmbeddings(model, dims, keep, userId),
    upsert: upsertBookmarkImageEmbeddings,
    listFailures: (model, dims) => listImageEmbedFailures(model, dims, userId),
    recordFailure: recordImageEmbedFailure,
    clearFailure: clearImageEmbedFailure,
    deleteAbsentFailures: (model, dims, keep) =>
      deleteAbsentImageEmbedFailures(model, dims, keep, userId),
  };
}

async function runSyncEmbed(userId: string, options: SyncEmbedOptions): Promise<void> {
  const env = options.env ?? process.env;
  if (!isOllamaConfigured(env)) return;

  const healthCheck = options.healthCheck ?? checkOllamaReachable;
  const reachable = await healthCheck(env, options.healthTimeoutMs ?? OLLAMA_HEALTH_TIMEOUT_MS);
  if (!reachable) {
    report(options, "warn", "skipped: embedding provider is unreachable");
    return;
  }

  if (!userId.trim()) {
    report(options, "error", "embedding pass failed");
    return;
  }

  const deadlineAt = options.deadlineAt ?? Date.now() + (options.budgetMs ?? SYNC_EMBED_BUDGET_MS);
  const textStore = options.textStore ?? textEmbeddingStoreForUser(userId);
  const imageStore = options.imageStore ?? imageEmbeddingStoreForUser(userId);
  const textProvider = options.textProvider ?? createEmbeddingProvider(env);
  const imageEmbedder = options.imageEmbedder ?? createOllamaImageEmbedder(env);

  let failure: string | null = null;
  try {
    await backfillBookmarkEmbeddings({
      store: textStore,
      provider: textProvider,
      batchSize: EMBEDDING_BACKFILL_BATCH_SIZE,
      timeoutMs: options.textTimeoutMs ?? SYNC_EMBED_TEXT_TIMEOUT_MS,
      limit: options.textLimit ?? SYNC_EMBED_TEXT_LIMIT,
      deadlineAt,
    });
  } catch (error) {
    failure = embedFailureLabel(error);
  }

  try {
    await backfillBookmarkImageEmbeddings({
      store: imageStore,
      embedder: imageEmbedder,
      fetchImage: options.fetchImage,
      timeoutMs: options.imageTimeoutMs ?? SYNC_EMBED_IMAGE_TIMEOUT_MS,
      fetchTimeoutMs: options.imageFetchTimeoutMs ?? SYNC_EMBED_IMAGE_FETCH_TIMEOUT_MS,
      limit: options.imageLimit ?? SYNC_EMBED_IMAGE_LIMIT,
      deadlineAt,
    });
  } catch (error) {
    failure ??= embedFailureLabel(error);
  }

  if (failure) report(options, "error", failure);
}

function assertUserId(userId: string): void {
  if (!userId.trim()) throw new Error("userId is required");
}

function embedFailureLabel(error: unknown): string {
  if (error instanceof EmbeddingProviderError) {
    return error.reason === "timeout" ? "embedding pass timed out" : "embedding provider unavailable";
  }
  return "embedding pass failed";
}

function report(options: SyncEmbedOptions, level: "warn" | "error", message: string): void {
  if (options.log) {
    options.log(level, message);
    return;
  }
  if (level === "error") logError("SyncEmbed", message);
  else logWarn("SyncEmbed", message);
}
