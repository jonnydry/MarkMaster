/**
 * Local embedding seam for opt-in smart search.
 *
 * v1 implements only Ollama on the owner's machine. A hosted Gemini provider
 * (gemini-embedding-2, also 768 dimensions) would implement `EmbeddingProvider`
 * and be constructed in `createEmbeddingProvider`. It is intentionally not
 * built: bookmark text stays on the box that runs Ollama.
 *
 * Prompt prefixes are the EmbeddingGemma 2 search pair from the model card
 * and the published sentence-transformers prompt table:
 *   query:    "task: search result | query: "
 *   document: "title: none | text: "
 * Bookmarks have no single title. Link titles are part of the document body,
 * so documents use the card's no-title form (`Retrieval-document` / `Document`).
 * Ollama does not add these prefixes. https://ollama.com/library/embeddinggemma-2
 */

export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

/** Text-only 270m tag. `embeddinggemma-2:latest` is the larger multimodal build. */
export const DEFAULT_EMBEDDING_MODEL = "embeddinggemma-2:270m";

/**
 * Text-and-vision tag. Text queries and image bytes land in one 768-d space.
 * Ollama runs this build on CPU on Linux.
 */
export const DEFAULT_IMAGE_EMBEDDING_MODEL = "embeddinggemma-2:440m-q8_0-text-vision";

export const EMBEDDING_DIMS = 768;

/**
 * Cap for one query embed. The call returns when Ollama responds.
 * It aborts only if the request is still running at this limit.
 * A model swap on a one-model Ollama is about 1.4–1.7s; a warm call is about 45ms.
 */
export const SMART_SEARCH_EMBED_TIMEOUT_MS = 4_000;

/** Override for {@link SMART_SEARCH_EMBED_TIMEOUT_MS}. A non-positive or non-finite value is ignored. */
export const SMART_SEARCH_EMBED_TIMEOUT_ENV = "SMART_SEARCH_EMBED_TIMEOUT_MS";

/**
 * Embed cap for `npm run embeddings:image-scores` when
 * {@link SMART_SEARCH_EMBED_TIMEOUT_ENV} is unset. Long enough for a cold model load.
 */
export const IMAGE_SCORE_EMBED_TIMEOUT_MS = 30_000;

/**
 * Ollama unloads a model after 5 minutes by default.
 * A negative keep_alive leaves it loaded until the server evicts it.
 */
export const OLLAMA_EMBED_KEEP_ALIVE = -1;

const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;
const QUERY_EMBEDDING_CACHE_LIMIT = 128;

export const EMBEDDING_QUERY_PREFIX = "task: search result | query: ";
export const EMBEDDING_DOCUMENT_PREFIX = "title: none | text: ";

export type EmbeddingKind = "query" | "document";

export type EmbeddingFallbackReason = "timeout" | "provider_unavailable";

export class EmbeddingProviderError extends Error {
  readonly reason: EmbeddingFallbackReason;

  constructor(reason: EmbeddingFallbackReason) {
    super(
      reason === "timeout"
        ? "Embedding provider timed out"
        : "Embedding provider is unavailable"
    );
    this.name = "EmbeddingProviderError";
    this.reason = reason;
  }
}

export interface EmbeddingProvider {
  readonly model: string;
  readonly dims: number;
  embed(
    texts: readonly string[],
    kind: EmbeddingKind,
    options?: { timeoutMs?: number }
  ): Promise<number[][]>;
}

/** Image side of the vision embedding model. Text queries use `EmbeddingProvider`. */
export interface ImageEmbedder {
  readonly model: string;
  readonly dims: number;
  embedImages(
    images: readonly string[],
    options?: { timeoutMs?: number }
  ): Promise<number[][]>;
}

export function formatEmbeddingInput(text: string, kind: EmbeddingKind): string {
  const prefix = kind === "query" ? EMBEDDING_QUERY_PREFIX : EMBEDDING_DOCUMENT_PREFIX;
  return prefix + text;
}

export function createEmbeddingProvider(env: NodeJS.ProcessEnv = process.env): EmbeddingProvider {
  return createOllamaEmbeddingProvider(env);
}

/** Text side of the vision model, so a query sits in the same space as stored images. */
export function createImageTextEmbeddingProvider(
  env: NodeJS.ProcessEnv = process.env
): EmbeddingProvider {
  const model = env.EMBEDDING_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_EMBEDDING_MODEL;
  return createOllamaEmbeddingProvider({ ...env, EMBEDDING_MODEL: model });
}

export function createOllamaEmbeddingProvider(env: NodeJS.ProcessEnv = process.env): EmbeddingProvider {
  const model = env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
  const baseUrl = ollamaBaseUrl(env);

  return {
    model,
    dims: EMBEDDING_DIMS,
    async embed(texts, kind, options) {
      if (texts.length === 0) return [];
      return postOllamaEmbed(
        baseUrl,
        model,
        texts.map((text) => formatEmbeddingInput(text, kind)),
        texts.length,
        options?.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS
      );
    },
  };
}

export function createOllamaImageEmbedder(env: NodeJS.ProcessEnv = process.env): ImageEmbedder {
  const model = env.EMBEDDING_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_EMBEDDING_MODEL;
  const baseUrl = ollamaBaseUrl(env);

  return {
    model,
    dims: EMBEDDING_DIMS,
    async embedImages(images, options) {
      if (images.length === 0) return [];
      const payloads = images.map(imageBase64Payload);
      const input = payloads.length === 1 ? { image: payloads[0] } : payloads.map((image) => ({ image }));
      return postOllamaEmbed(
        baseUrl,
        model,
        input,
        payloads.length,
        options?.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS
      );
    },
  };
}

/** Raw base64, without a `data:` URL prefix. Ollama's `image` field is the bytes. */
export function imageBase64Payload(value: string): string {
  const trimmed = value.trim();
  const comma = trimmed.indexOf(",");
  if (trimmed.startsWith("data:") && comma !== -1) return trimmed.slice(comma + 1);
  return trimmed;
}

function ollamaBaseUrl(env: NodeJS.ProcessEnv): string {
  return (env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "");
}

/** Positive finite milliseconds from the env, otherwise `fallback`. */
export function smartSearchEmbedTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
  fallback = SMART_SEARCH_EMBED_TIMEOUT_MS
): number {
  const raw = env[SMART_SEARCH_EMBED_TIMEOUT_ENV];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

type OllamaEmbedInput = string | { image: string };

async function postOllamaEmbed(
  baseUrl: string,
  model: string,
  input: OllamaEmbedInput | readonly OllamaEmbedInput[],
  expected: number,
  timeoutMs: number
): Promise<number[][]> {
  // Cap, not a delay: a response that arrives first is returned, and the timer is cleared.
  // The timer aborts the request only when it is still pending.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input, keep_alive: OLLAMA_EMBED_KEEP_ALIVE }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new EmbeddingProviderError("provider_unavailable");
    }

    const payload = (await response.json()) as { embeddings?: unknown };
    return parseOllamaEmbeddings(payload.embeddings, expected);
  } catch (error) {
    if (error instanceof EmbeddingProviderError) throw error;
    if (isTimeoutError(error) || controller.signal.aborted) {
      throw new EmbeddingProviderError("timeout");
    }
    throw new EmbeddingProviderError("provider_unavailable");
  } finally {
    clearTimeout(timer);
  }
}

function parseOllamaEmbeddings(embeddings: unknown, expected: number): number[][] {
  if (!Array.isArray(embeddings) || embeddings.length !== expected) {
    throw new EmbeddingProviderError("provider_unavailable");
  }

  return embeddings.map((row) => {
    if (!Array.isArray(row) || row.length !== EMBEDDING_DIMS) {
      throw new EmbeddingProviderError("provider_unavailable");
    }
    const vector: number[] = [];
    for (const value of row) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new EmbeddingProviderError("provider_unavailable");
      }
      vector.push(value);
    }
    return vector;
  });
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  return name === "TimeoutError" || name === "AbortError";
}

const queryEmbeddingCache = new Map<string, number[]>();
const queryEmbeddingInflight = new Map<string, Promise<number[]>>();

export function clearQueryEmbeddingCache(): void {
  queryEmbeddingCache.clear();
  queryEmbeddingInflight.clear();
}

function rememberQueryEmbedding(key: string, vector: number[]): void {
  if (queryEmbeddingCache.has(key)) queryEmbeddingCache.delete(key);
  queryEmbeddingCache.set(key, vector);
  while (queryEmbeddingCache.size > QUERY_EMBEDDING_CACHE_LIMIT) {
    const oldest = queryEmbeddingCache.keys().next().value;
    if (oldest === undefined) break;
    queryEmbeddingCache.delete(oldest);
  }
}

/**
 * Embed one search query, reusing an in-memory vector for the same model and text.
 * `timeoutMs` is a cap passed to the provider. A fast embed returns immediately.
 */
export async function embedSearchQuery(
  provider: EmbeddingProvider,
  text: string,
  timeoutMs = smartSearchEmbedTimeoutMs()
): Promise<number[]> {
  const key = `${provider.model}\0${provider.dims}\0${text}`;
  const cached = queryEmbeddingCache.get(key);
  if (cached) {
    rememberQueryEmbedding(key, cached);
    return cached.slice();
  }

  const inflight = queryEmbeddingInflight.get(key);
  if (inflight) return (await inflight).slice();

  const pending = provider
    .embed([text], "query", { timeoutMs })
    .then((rows) => {
      const vector = rows[0];
      if (!vector) throw new EmbeddingProviderError("provider_unavailable");
      rememberQueryEmbedding(key, vector.slice());
      return vector;
    })
    .finally(() => {
      queryEmbeddingInflight.delete(key);
    });

  queryEmbeddingInflight.set(key, pending);
  return (await pending).slice();
}
