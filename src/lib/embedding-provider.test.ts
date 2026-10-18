import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearQueryEmbeddingCache,
  createOllamaEmbeddingProvider,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_OLLAMA_BASE_URL,
  EMBEDDING_DIMS,
  EMBEDDING_DOCUMENT_PREFIX,
  EMBEDDING_QUERY_PREFIX,
  EmbeddingProviderError,
  embedSearchQuery,
} from "./embedding-provider";

function vector(length = EMBEDDING_DIMS, fill = 0.25): number[] {
  return Array.from({ length }, () => fill);
}

describe("Ollama embedding provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearQueryEmbeddingCache();
  });

  it("sends the model-card query and document prefixes to the local embed API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embeddings: [vector(), vector(EMBEDDING_DIMS, 0.5)] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOllamaEmbeddingProvider({
      OLLAMA_BASE_URL: "http://127.0.0.1:11434/",
      EMBEDDING_MODEL: "",
    });

    expect(provider.model).toBe(DEFAULT_EMBEDDING_MODEL);
    expect(provider.dims).toBe(EMBEDDING_DIMS);

    const rows = await provider.embed(["ownership", "notes"], "document");

    expect(rows).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_OLLAMA_BASE_URL}/api/embed`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      model: DEFAULT_EMBEDDING_MODEL,
      input: [
        `${EMBEDDING_DOCUMENT_PREFIX}ownership`,
        `${EMBEDDING_DOCUMENT_PREFIX}notes`,
      ],
    });
  });

  it("prefixes queries with the search-result task", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embeddings: [vector()] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOllamaEmbeddingProvider({
      EMBEDDING_MODEL: "embeddinggemma-2:270m",
      OLLAMA_BASE_URL: "http://127.0.0.1:11434",
    });
    await provider.embed(["rust lifetimes"], "query");

    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.input).toEqual([`${EMBEDDING_QUERY_PREFIX}rust lifetimes`]);
  });

  it("reports a timeout and an unreachable provider separately", async () => {
    const provider = createOllamaEmbeddingProvider({});

    vi.stubGlobal(
      "fetch",
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
          });
        })
    );
    await expect(provider.embed(["q"], "query", { timeoutMs: 20 })).rejects.toMatchObject({
      reason: "timeout",
    });

    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    await expect(provider.embed(["q"], "query")).rejects.toBeInstanceOf(EmbeddingProviderError);
    await expect(provider.embed(["q"], "query")).rejects.toMatchObject({
      reason: "provider_unavailable",
    });

    vi.stubGlobal("fetch", async () => ({ ok: false, status: 500, json: async () => ({}) }));
    await expect(provider.embed(["q"], "query")).rejects.toMatchObject({
      reason: "provider_unavailable",
    });
  });

  it("rejects a vector with the wrong number of dimensions", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ embeddings: [vector(3)] }),
    }));
    const provider = createOllamaEmbeddingProvider({});
    await expect(provider.embed(["q"], "query")).rejects.toMatchObject({
      reason: "provider_unavailable",
    });
  });

  it("caches a query embedding in memory", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embeddings: [vector()] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createOllamaEmbeddingProvider({});

    const first = await embedSearchQuery(provider, "same query", 1500);
    const second = await embedSearchQuery(provider, "same query", 1500);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    first[0] = 99;
    expect(second[0]).toBeCloseTo(0.25);
  });

  it("returns an empty list without calling Ollama when there is no text", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createOllamaEmbeddingProvider({});
    await expect(provider.embed([], "document")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
