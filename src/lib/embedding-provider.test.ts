import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkOllamaReachable,
  clearQueryEmbeddingCache,
  configuredOllamaBaseUrl,
  createImageTextEmbeddingProvider,
  createOllamaEmbeddingProvider,
  createOllamaImageEmbedder,
  DEFAULT_EMBEDDING_MODEL,
  isOllamaConfigured,
  OLLAMA_HEALTH_TIMEOUT_MS,
  DEFAULT_IMAGE_EMBEDDING_MODEL,
  DEFAULT_OLLAMA_BASE_URL,
  EMBEDDING_DIMS,
  EMBEDDING_DOCUMENT_PREFIX,
  EMBEDDING_QUERY_PREFIX,
  EmbeddingProviderError,
  DEFAULT_OLLAMA_EMBED_KEEP_ALIVE,
  IMAGE_SCORE_EMBED_TIMEOUT_MS,
  SMART_SEARCH_EMBED_TIMEOUT_MS,
  embedSearchQuery,
  ollamaEmbedKeepAlive,
  smartSearchEmbedTimeoutMs,
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
      keep_alive: DEFAULT_OLLAMA_EMBED_KEEP_ALIVE,
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

    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        "fetch",
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => {
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            });
          })
      );
      let reason: unknown;
      const pending = provider.embed(["q"], "query", { timeoutMs: 4_000 }).then(
        () => {
          throw new Error("resolved");
        },
        (error: unknown) => {
          reason = error;
        }
      );
      await vi.advanceTimersByTimeAsync(3_999);
      expect(reason).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(reason).toMatchObject({ reason: "timeout" });
    } finally {
      vi.useRealTimers();
    }

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

  it("embeds a query on the vision model's text side and an image as base64", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embeddings: [vector()] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const textSide = createImageTextEmbeddingProvider({
      OLLAMA_BASE_URL: "http://127.0.0.1:11434/",
      EMBEDDING_IMAGE_MODEL: "",
    });
    expect(textSide.model).toBe(DEFAULT_IMAGE_EMBEDDING_MODEL);
    await textSide.embed(["red bicycle"], "query");

    const imageSide = createOllamaImageEmbedder({
      EMBEDDING_IMAGE_MODEL: "custom-vision",
      OLLAMA_BASE_URL: "http://127.0.0.1:11434",
    });
    await imageSide.embedImages(["data:image/jpeg;base64,aaaa"]);

    const first = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    const second = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`${DEFAULT_OLLAMA_BASE_URL}/api/embed`);
    expect(first).toEqual({
      model: DEFAULT_IMAGE_EMBEDDING_MODEL,
      input: [`${EMBEDDING_QUERY_PREFIX}red bicycle`],
      keep_alive: DEFAULT_OLLAMA_EMBED_KEEP_ALIVE,
    });
    expect(second).toEqual({
      model: "custom-vision",
      input: { image: "aaaa" },
      keep_alive: DEFAULT_OLLAMA_EMBED_KEEP_ALIVE,
    });
  });

  it("returns a fast embed without waiting out the timeout", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", async () => ({
        ok: true,
        json: async () => ({ embeddings: [vector()] }),
      }));
      const provider = createOllamaEmbeddingProvider({});
      const started = Date.now();
      let settled = false;
      const pending = provider.embed(["q"], "query", { timeoutMs: SMART_SEARCH_EMBED_TIMEOUT_MS }).then(
        (rows) => {
          settled = true;
          return rows;
        }
      );
      for (let turn = 0; turn < 20 && !settled; turn += 1) await Promise.resolve();
      expect(settled).toBe(true);
      expect(Date.now()).toBe(started);
      expect(vi.getTimerCount()).toBe(0);
      await expect(pending).resolves.toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads a positive embed timeout and otherwise uses the fallback", () => {
    expect(SMART_SEARCH_EMBED_TIMEOUT_MS).toBe(4_000);
    expect(IMAGE_SCORE_EMBED_TIMEOUT_MS).toBe(30_000);
    expect(DEFAULT_OLLAMA_EMBED_KEEP_ALIVE).toBe("30m");
    expect(smartSearchEmbedTimeoutMs({})).toBe(4_000);
    expect(smartSearchEmbedTimeoutMs({}, IMAGE_SCORE_EMBED_TIMEOUT_MS)).toBe(30_000);
    expect(smartSearchEmbedTimeoutMs({ SMART_SEARCH_EMBED_TIMEOUT_MS: "2500" })).toBe(2_500);
    expect(
      smartSearchEmbedTimeoutMs({ SMART_SEARCH_EMBED_TIMEOUT_MS: "2500" }, IMAGE_SCORE_EMBED_TIMEOUT_MS)
    ).toBe(2_500);
    expect(smartSearchEmbedTimeoutMs({ SMART_SEARCH_EMBED_TIMEOUT_MS: "1" })).toBe(100);
    expect(smartSearchEmbedTimeoutMs({ SMART_SEARCH_EMBED_TIMEOUT_MS: "99" })).toBe(100);
    expect(smartSearchEmbedTimeoutMs({ SMART_SEARCH_EMBED_TIMEOUT_MS: "100" })).toBe(100);
    expect(smartSearchEmbedTimeoutMs({ SMART_SEARCH_EMBED_TIMEOUT_MS: "30000" })).toBe(30_000);
    expect(smartSearchEmbedTimeoutMs({ SMART_SEARCH_EMBED_TIMEOUT_MS: "0.4" })).toBe(100);
    expect(smartSearchEmbedTimeoutMs({ SMART_SEARCH_EMBED_TIMEOUT_MS: "1e9" })).toBe(30_000);
    expect(smartSearchEmbedTimeoutMs({ SMART_SEARCH_EMBED_TIMEOUT_MS: "3000000000" })).toBe(30_000);
    expect(smartSearchEmbedTimeoutMs({ SMART_SEARCH_EMBED_TIMEOUT_MS: "1e309" })).toBe(4_000);
    expect(smartSearchEmbedTimeoutMs({ SMART_SEARCH_EMBED_TIMEOUT_MS: "0" })).toBe(4_000);
    expect(smartSearchEmbedTimeoutMs({ SMART_SEARCH_EMBED_TIMEOUT_MS: "-5" }, 30_000)).toBe(30_000);
    expect(smartSearchEmbedTimeoutMs({ SMART_SEARCH_EMBED_TIMEOUT_MS: "nope" })).toBe(4_000);
    expect(smartSearchEmbedTimeoutMs({ SMART_SEARCH_EMBED_TIMEOUT_MS: "  " })).toBe(4_000);
  });

  it("passes SMART_SEARCH_EMBED_TIMEOUT_MS through to embedSearchQuery", async () => {
    vi.stubEnv("SMART_SEARCH_EMBED_TIMEOUT_MS", "2500");
    try {
      const embed = vi.fn(async () => [vector()]);
      await embedSearchQuery({ model: "probe", dims: EMBEDDING_DIMS, embed }, "probe query");
      expect(embed).toHaveBeenCalledWith(["probe query"], "query", { timeoutMs: 2_500 });
    } finally {
      vi.unstubAllEnvs();
      clearQueryEmbeddingCache();
    }
  });

  it("sends a bounded keep_alive and never sends -1", async () => {
    expect(ollamaEmbedKeepAlive({})).toBe("30m");
    expect(ollamaEmbedKeepAlive({ OLLAMA_EMBED_KEEP_ALIVE: "-1" })).toBe("30m");
    expect(ollamaEmbedKeepAlive({ OLLAMA_EMBED_KEEP_ALIVE: "0" })).toBe("30m");
    expect(ollamaEmbedKeepAlive({ OLLAMA_EMBED_KEEP_ALIVE: "25h" })).toBe("30m");
    expect(ollamaEmbedKeepAlive({ OLLAMA_EMBED_KEEP_ALIVE: "500ms" })).toBe("30m");
    expect(ollamaEmbedKeepAlive({ OLLAMA_EMBED_KEEP_ALIVE: "5m" })).toBe("5m");
    expect(ollamaEmbedKeepAlive({ OLLAMA_EMBED_KEEP_ALIVE: "24h" })).toBe("24h");
    expect(ollamaEmbedKeepAlive({ OLLAMA_EMBED_KEEP_ALIVE: "90" })).toBe("90s");
    expect(ollamaEmbedKeepAlive({ OLLAMA_EMBED_KEEP_ALIVE: "1h30m" })).toBe("30m");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embeddings: [vector()] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const ignored = createOllamaEmbeddingProvider({ OLLAMA_EMBED_KEEP_ALIVE: "-1" });
    await ignored.embed(["q"], "query");
    const custom = createOllamaEmbeddingProvider({ OLLAMA_EMBED_KEEP_ALIVE: "5m" });
    await custom.embed(["q"], "query");

    const first = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    const second = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    expect(first.keep_alive).toBe("30m");
    expect(first.keep_alive).not.toBe(-1);
    expect(second.keep_alive).toBe("5m");
  });

  it("sends OLLAMA_EMBED_KEEP_ALIVE on the image embed path", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embeddings: [vector()] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const imageSide = createOllamaImageEmbedder({
      OLLAMA_EMBED_KEEP_ALIVE: "5m",
      OLLAMA_BASE_URL: "http://127.0.0.1:11434",
    });
    await imageSide.embedImages(["aaaa"]);

    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.keep_alive).toBe("5m");
    expect(body.keep_alive).not.toBe(-1);
    expect(body.model).toBe(DEFAULT_IMAGE_EMBEDDING_MODEL);
    expect(body.input).toEqual({ image: "aaaa" });
  });

  it("returns an empty list without calling Ollama when there is no text", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = createOllamaEmbeddingProvider({});
    await expect(provider.embed([], "document")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Ollama health gate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not call the network when OLLAMA_BASE_URL is unset or blank", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(isOllamaConfigured({})).toBe(false);
    expect(configuredOllamaBaseUrl({ OLLAMA_BASE_URL: "  " })).toBeNull();
    await expect(checkOllamaReachable({})).resolves.toBe(false);
    await expect(checkOllamaReachable({ OLLAMA_BASE_URL: "  " })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a healthy tags response and rejects a failure without throwing", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: { cancel: async () => undefined },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const env = { OLLAMA_BASE_URL: "http://127.0.0.1:11434/" };
    await expect(checkOllamaReachable(env)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:11434/api/tags", {
      method: "GET",
      signal: expect.any(AbortSignal),
    });
    expect(OLLAMA_HEALTH_TIMEOUT_MS).toBe(1_500);

    fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED http://user:secret@127.0.0.1:11434"));
    await expect(checkOllamaReachable(env)).resolves.toBe(false);
  });
});
