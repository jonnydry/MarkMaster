import { AuthenticationError, RateLimitError } from "@typesafe-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPackLimiter,
  libraryPostJudgmentText,
  planLibraryAssignments,
  shortlistLibraryPackTags,
} from "@/lib/orbit-library-assign";

const systemOneMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/typesafe", () => ({
  getTypeSafeClient: () => ({ systemOne: systemOneMock }),
  getTypeSafeModel: () => "jev-latest",
}));

vi.mock("@/lib/logger", () => ({ logWarn: vi.fn(), logError: vi.fn() }));

const vocabulary = [
  { name: "AI", color: "#1d9bf0" },
  { name: "Cooking", color: "#f97316" },
];

function posts(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `bm-${index}`,
    tweetText: `post ${index}`,
    media: null,
    xMetadata: null,
  }));
}

/** Every post in the pack matches the first tag strongly. */
function strongFirstTag(request: { questions: Record<string, unknown> }) {
  const answers: Record<string, { noul: number }> = {};
  for (const key of Object.keys(request.questions)) {
    answers[key] = { noul: key.endsWith("t0") ? 0.95 : 0.1 };
  }
  return { answers };
}

const rateLimited = () =>
  new RateLimitError(429, null, new Headers(), "rate limited");

beforeEach(() => {
  systemOneMock.mockReset();
});

describe("libraryPostJudgmentText", () => {
  it("includes the long-post note, article, link, and image alt text", () => {
    const text = libraryPostJudgmentText({
      id: "bm-1",
      tweetText: "Today we’re announcing OrcaSAQ-2",
      media: [{ type: "photo", alt_text: "Gradient card for the model" }],
      urls: [{ expanded_url: "https://example.com/ignored" }],
      xMetadata: {
        tweet: {
          note_tweet: {
            text: "A 27B model you can deploy.\nhttps://t.co/FqslE1kYnw",
            entities: {
              urls: [{ expanded_url: "https://huggingface.co/orcarouter/OrcaSAQ-2-27B" }],
            },
          },
          article: { title: "OrcaSAQ-2" },
        },
        author: { description: "Quantization research." },
      },
    });

    expect(text).toContain("A 27B model you can deploy.");
    expect(text).toContain("Today we’re announcing");
    expect(text).toContain("OrcaSAQ-2");
    expect(text).toContain("huggingface.co/orcarouter/OrcaSAQ-2-27B");
    expect(text).toContain("Gradient card for the model");
    expect(text).not.toContain("Quantization research.");
  });
});

describe("shortlistLibraryPackTags", () => {
  it("keeps a rare tag whose name is in the post ahead of unused popular tags", () => {
    const vocabulary = [
      ...Array.from({ length: 40 }, (_, index) => ({
        name: `Popular ${index}`,
        color: "#111111",
      })),
      { name: "Quantization", color: "#222222" },
    ];
    const shortlist = shortlistLibraryPackTags(
      [
        {
          id: "bm-1",
          tweetText: "Notes on quantization for long-horizon agents.",
          media: null,
        },
      ],
      vocabulary,
      8
    );

    expect(shortlist[0]).toBe("Quantization");
    expect(shortlist).toHaveLength(8);
  });

  it("does not treat a tag as present when it is only a fragment of another word", () => {
    const shortlist = shortlistLibraryPackTags(
      [{ id: "bm-1", tweetText: "This is available at the start.", media: null }],
      [
        { name: "Cooking", color: "#333333" },
        { name: "AI", color: "#111111" },
        { name: "Art", color: "#222222" },
      ],
      3
    );

    expect(shortlist).toEqual(["Cooking", "AI", "Art"]);
  });

  it("dedupes vocabulary names before packing questions", () => {
    const shortlist = shortlistLibraryPackTags(
      [{ id: "bm-1", tweetText: "Notes on quantization.", media: null }],
      [
        { name: "Quantization", color: "#111111" },
        { name: "quantization", color: "#222222" },
        { name: "Cooking", color: "#333333" },
      ],
      8
    );

    expect(shortlist.filter((name) => /quantization/i.test(name))).toHaveLength(1);
    expect(shortlist[0]).toBe("Quantization");
  });
});

describe("planLibraryAssignments", () => {
  it("leaves retries to the TypeSafe client with a pack-sized timeout", async () => {
    systemOneMock.mockImplementation(async (request) => strongFirstTag(request));

    const result = await planLibraryAssignments({
      bookmarks: posts(3),
      vocabulary,
    });

    expect(systemOneMock).toHaveBeenCalledTimes(1);
    expect(systemOneMock.mock.calls[0]?.[1]).toEqual({
      timeout: 20_000,
      retry: { maxRetries: 1 },
    });
    expect(result.failed).toBe(0);
    expect(result.modelChecked).toBe(3);
    expect(result.plan.suggestions.map((s) => s.tags.map((t) => t.name))).toEqual([
      ["AI"],
      ["AI"],
      ["AI"],
    ]);
  });

  it("keeps Jev's score on an applied tag and a weaker score off the plan", async () => {
    systemOneMock.mockImplementation(async (request) => strongFirstTag(request));

    const result = await planLibraryAssignments({
      bookmarks: posts(1),
      vocabulary,
    });

    expect(result.plan.suggestions[0]?.tags).toEqual([
      expect.objectContaining({ name: "AI", score: 0.95, origin: "jev" }),
    ]);
    expect(result.scores?.get("bm-0")).toEqual([
      { name: "AI", score: 0.95 },
      { name: "Cooking", score: 0.1 },
    ]);
  });

  it("shows Jev each tag's examples and points questions at them", async () => {
    systemOneMock.mockImplementation(async (request) => strongFirstTag(request));

    await planLibraryAssignments({
      bookmarks: posts(1),
      vocabulary,
      examples: new Map([["ai", ["Notes on transformer scaling"]]]),
    });

    const request = systemOneMock.mock.calls[0]?.[0] as {
      state: { tags: Array<{ name: string; examples?: string[] }> };
      questions: Record<string, { instructions: { question: string } }>;
    };
    expect(request.state.tags).toEqual([
      { name: "AI", examples: ["Notes on transformer scaling"] },
      { name: "Cooking" },
    ]);
    expect(request.questions.p0t1?.instructions.question).toContain("`tags[1]`");
  });

  it("still asks Jev about a post whose X topic matched a tag", async () => {
    systemOneMock.mockImplementation(async (request) => {
      const answers: Record<string, { noul: number }> = {};
      for (const key of Object.keys(request.questions)) {
        // Jev finds the specific tag (Cooking) the broad topic would have hidden.
        answers[key] = { noul: key.endsWith("t1") ? 0.92 : 0.1 };
      }
      return { answers };
    });

    const result = await planLibraryAssignments({
      bookmarks: [
        {
          id: "bm-topic",
          tweetText: "Weeknight pasta",
          media: null,
          xMetadata: {
            tweet: { context_annotations: [{ entity: { name: "AI" } }] },
          },
        },
      ],
      vocabulary,
    });

    expect(systemOneMock).toHaveBeenCalledTimes(1);
    expect(result.plan.suggestions[0]?.tags.map((tag) => tag.name)).toEqual([
      "AI",
      "Cooking",
    ]);
  });

  it("counts a pack that stays rate limited as failed and keeps the rest", async () => {
    // Pack 1 (6 posts) always rate limited; pack 2 (2 posts) succeeds.
    systemOneMock.mockImplementation(async (request) => {
      const ids = (request.state.posts as Array<{ id: string }>).map((p) => p.id);
      if (ids.includes("bm-0")) throw rateLimited();
      return strongFirstTag(request);
    });

    const result = await planLibraryAssignments({
      bookmarks: posts(8),
      vocabulary,
    });

    // The client already retried; a pack still throttled is skipped, not fatal.
    expect(result.failed).toBe(6);
    expect(result.plan.suggestions.map((s) => s.bookmarkId)).toEqual([
      "bm-6",
      "bm-7",
    ]);
  });

  it("stops on a credential failure rather than failing every pack", async () => {
    systemOneMock.mockRejectedValue(
      new AuthenticationError(401, null, new Headers(), "bad key")
    );

    await expect(
      planLibraryAssignments({
        bookmarks: posts(12),
        vocabulary,
      })
    ).rejects.toMatchObject({ code: "typesafe_auth" });
  });
});

describe("createPackLimiter", () => {
  it("caps calls in flight and starts queued ones in order", async () => {
    const limit = createPackLimiter(2);
    const started: number[] = [];
    let inFlight = 0;
    let peak = 0;
    const releases: Array<() => void> = [];

    const tasks = [0, 1, 2, 3].map((index) =>
      limit(async () => {
        started.push(index);
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise<void>((resolve) => releases.push(resolve));
        inFlight -= 1;
        return index;
      })
    );

    await vi.waitFor(() => expect(started).toEqual([0, 1]));
    releases[1]!();
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
    releases[0]!();
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3]));
    releases[2]!();
    releases[3]!();

    await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
  });

  it("frees the slot when a call fails", async () => {
    const limit = createPackLimiter(1);
    await expect(limit(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(limit(async () => "next")).resolves.toBe("next");
  });

  it("shares slots across batches so a second page fills the first page's idle ones", async () => {
    const limiter = createPackLimiter(2);
    let inFlight = 0;
    let peak = 0;
    systemOneMock.mockImplementation(async (request) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return strongFirstTag(request);
    });

    await Promise.all([
      planLibraryAssignments({ bookmarks: posts(18), vocabulary, limiter }),
      planLibraryAssignments({ bookmarks: posts(18), vocabulary, limiter }),
    ]);

    expect(systemOneMock).toHaveBeenCalledTimes(6);
    expect(peak).toBe(2);
  });

  it("never sends packs that were still queued when the batch was abandoned", async () => {
    const limiter = createPackLimiter(1);
    const abandon = new AbortController();
    systemOneMock.mockImplementation(async (request) => {
      abandon.abort();
      return strongFirstTag(request);
    });

    await planLibraryAssignments({
      bookmarks: posts(18),
      vocabulary,
      limiter,
      signal: abandon.signal,
    });

    // The pack in flight finishes; the two queued behind it are dropped.
    expect(systemOneMock).toHaveBeenCalledOnce();
  });

  it("cancels the Jev call in flight when the batch is abandoned", async () => {
    const abandon = new AbortController();
    systemOneMock.mockImplementation(
      (_request, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted"))
          );
        })
    );

    const planning = planLibraryAssignments({
      bookmarks: posts(6),
      vocabulary,
      signal: abandon.signal,
    });
    await vi.waitFor(() => expect(systemOneMock).toHaveBeenCalledOnce());
    abandon.abort();
    const result = await planning;

    expect(systemOneMock.mock.calls[0]?.[1]?.signal).toBe(abandon.signal);
    // An abandoned page's packs are not failures; nobody reads them.
    expect(result.failed).toBe(0);
    expect(result.plan.suggestions).toEqual([]);
  });

});
