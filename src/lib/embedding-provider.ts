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

export const EMBEDDING_DIMS = 768;

/** Search calls bail out quickly so keyword results can take over. */
export const SMART_SEARCH_EMBED_TIMEOUT_MS = 1_500;

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

export function formatEmbeddingInput(text: string, kind: EmbeddingKind): string {
  const prefix = kind === "query" ? EMBEDDING_QUERY_PREFIX : EMBEDDING_DOCUMENT_PREFIX;
  return prefix + text;
}

export function createEmbeddingProvider(env: NodeJS.ProcessEnv = process.env): EmbeddingProvider {
  return createOllamaEmbeddingProvider(env);
}

export function createOllamaEmbeddingProvider(env: NodeJS.ProcessEnv = process.env): EmbeddingProvider {
  const model = env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
  const baseUrl = (env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "");

  return {
    model,
    dims: EMBEDDING_DIMS,
    async embed(texts, kind, options) {
      if (texts.length === 0) return [];

      const timeoutMs = options?.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${baseUrl}/api/embed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            input: texts.map((text) => formatEmbeddingInput(text, kind)),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new EmbeddingProviderError("provider_unavailable");
        }

        const payload = (await response.json()) as { embeddings?: unknown };
        const embeddings = payload.embeddings;
        if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
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
      } catch (error) {
        if (error instanceof EmbeddingProviderError) throw error;
        if (isTimeoutError(error) || controller.signal.aborted) {
          throw new EmbeddingProviderError("timeout");
        }
        throw new EmbeddingProviderError("provider_unavailable");
      } finally {
        clearTimeout(timer);
      }
    },
  };
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

/** Embed one search query, reusing an in-memory vector for the same model and text. */
export async function embedSearchQuery(
  provider: EmbeddingProvider,
  text: string,
  timeoutMs = SMART_SEARCH_EMBED_TIMEOUT_MS
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
