import { beforeEach, describe, expect, it, vi } from "vitest";

import { ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN } from "@/lib/orbit-config";
import {
  assignAndRefineOrbitJev,
  chunkItems,
  computeOrbitHybridScanMetrics,
  grokCallBudgetMs,
  mergeLeftoverSuggestion,
  mergeOrbitScanPlans,
  refineOrbitJevLeftovers,
  runHybridOrbitScan,
  selectOrbitJevLeftovers,
} from "@/lib/orbit-hybrid-scan";
import {
  harvestOrbitAcceptedLabels,
  replaceOrbitJevAssignments,
  type OrbitJevAssignment,
} from "@/lib/orbit-jev-assign";
import type { OrbitBookmarkForScan } from "@/lib/orbit-grok-schemas";

const assignSpy = vi.hoisted(() => vi.fn());
const proposeSpy = vi.hoisted(() => vi.fn());
const verifySpy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/orbit-jev-assign", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orbit-jev-assign")>();
  return {
    ...actual,
    assignOrbitBookmarksWithJev: assignSpy,
    verifyOrbitSuggestionsWithJev: verifySpy,
  };
});

vi.mock("@/lib/orbit-grok-vocab", () => ({
  proposeOrbitVocabWithXai: proposeSpy,
}));

function scanBookmark(id: string): OrbitBookmarkForScan {
  return {
    id,
    tweetId: id,
    authorUsername: "researcher",
    authorDisplayName: "Researcher",
    authorVerified: false,
    tweetText: "AI research notes on scaling laws for LLM evaluations.",
    tweetCreatedAt: new Date("2026-01-01"),
    bookmarkedAt: new Date("2026-01-02"),
    publicMetrics: null,
    media: null,
    urls: [],
    quotedTweet: null,
    notes: [],
  };
}

function abstainAssignment(bookmarkId: string): OrbitJevAssignment {
  return {
    bookmarkId,
    confidence: "low",
    reasoning: "No candidate label cleared the apply threshold.",
    tags: [],
    collection: null,
    needsNewLabel: false,
    abstain: true,
    coarseFit: false,
  };
}

function placedAssignment(
  bookmarkId: string,
  tag: string,
  score = 0.9
): OrbitJevAssignment {
  return {
    ...abstainAssignment(bookmarkId),
    confidence: score >= 0.8 ? "high" : "medium",
    reasoning: "Matched 1 existing tag from your library.",
    tags: [{ name: tag, color: "#1d9bf0", reason: "match", score, origin: "jev" }],
    abstain: false,
  };
}

/** Jev's check of Grok's tags: every tag kept at the given score. */
function verifyAll(score: number) {
  return async (call: {
    suggestions: Array<{
      bookmarkId: string;
      reasoning: string;
      tags: Array<{ name: string; color: string; reason: string }>;
      collection: null;
    }>;
  }) =>
    call.suggestions.map((suggestion) => ({
      ...suggestion,
      confidence: score >= 0.8 ? ("high" as const) : ("medium" as const),
      tags: suggestion.tags.map((tag) => ({ ...tag, score, origin: "grok" as const })),
    }));
}

beforeEach(() => {
  assignSpy.mockReset();
  assignSpy.mockResolvedValue([]);
  proposeSpy.mockReset();
  proposeSpy.mockResolvedValue({ tags: [], collections: [] });
  verifySpy.mockReset();
  verifySpy.mockImplementation(verifyAll(0.7));
});

describe("computeOrbitHybridScanMetrics", () => {
  it("counts refine recoveries from leftover shrinkage", () => {
    expect(
      computeOrbitHybridScanMetrics({
        firstPassLeftovers: 18,
        refinedLeftovers: 7,
        escalatedToGrok: 7,
      })
    ).toEqual({
      firstPassLeftovers: 18,
      refinedLeftovers: 7,
      recoveredOnRefine: 11,
      escalatedToGrok: 7,
      coarseFits: 0,
      namedByGrok: 0,
      narrowed: 0,
      escalationSkipped: 0,
    });
  });
});

describe("grokCallBudgetMs", () => {
  it("uses the full cap without a deadline", () => {
    expect(grokCallBudgetMs(undefined, 60_000)).toBe(60_000);
  });

  it("keeps the Jev reserve back and caps at the step's limit", () => {
    const now = 1_000_000;
    expect(grokCallBudgetMs(now + 200_000, 60_000, 20_000, now)).toBe(60_000);
    expect(grokCallBudgetMs(now + 50_000, 60_000, 20_000, now)).toBe(30_000);
  });

  it("skips the call when too little time is left", () => {
    const now = 1_000_000;
    expect(grokCallBudgetMs(now + 30_000, 60_000, 20_000, now)).toBeNull();
  });
});

describe("chunkItems", () => {
  it("splits leftovers so each Grok call stays at the Grok scan cap", () => {
    const leftovers = Array.from({ length: 80 }, (_, index) => `bm-${index}`);
    const chunks = chunkItems(leftovers, ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(36);
    expect(chunks[1]).toHaveLength(36);
    expect(chunks[2]).toHaveLength(8);
  });
});

describe("selectOrbitJevLeftovers", () => {
  it("keeps only abstains and needs-new-label assignments", () => {
    const leftovers = selectOrbitJevLeftovers([
      {
        bookmarkId: "a",
        confidence: "high",
        reasoning: "ok",
        tags: [{ name: "AI", color: "#1d9bf0", reason: "match" }],
        collection: null,
        needsNewLabel: false,
        abstain: false,
      },
      {
        bookmarkId: "b",
        confidence: "low",
        reasoning: "new",
        tags: [],
        collection: null,
        needsNewLabel: true,
        abstain: false,
      },
      {
        bookmarkId: "c",
        confidence: "low",
        reasoning: "none",
        tags: [],
        collection: null,
        needsNewLabel: false,
        abstain: true,
      },
    ]);

    expect(leftovers.map((item) => item.bookmarkId)).toEqual(["b", "c"]);
  });

  it("does not re-queue a bookmark that already has tags even if needsNewLabel is set", () => {
    const leftovers = selectOrbitJevLeftovers([
      {
        bookmarkId: "placed",
        confidence: "high",
        reasoning: "matched",
        tags: [{ name: "AI", color: "#1d9bf0", reason: "match" }],
        collection: null,
        needsNewLabel: true,
        abstain: false,
      },
    ]);

    expect(leftovers).toEqual([]);
  });
});

describe("mergeLeftoverSuggestion", () => {
  it("keeps Jev reuse tags and adds Grok names", () => {
    const merged = mergeLeftoverSuggestion(
      {
        bookmarkId: "leftover",
        confidence: "high",
        reasoning: "Jev matched AI.",
        tags: [{ name: "AI", color: "#1d9bf0", reason: "noul" }],
        collection: null,
      },
      {
        bookmarkId: "leftover",
        confidence: "medium",
        reasoning: "Grok named Compilers.",
        tags: [
          { name: "AI", color: "#1d9bf0", reason: "reuse" },
          { name: "Compilers", color: "#64748b", reason: "gap" },
        ],
        collection: {
          name: "Language Design",
          description: "Compiler notes.",
          reason: "shared leftover theme",
        },
      }
    );

    expect(merged.tags.map((tag) => tag.name)).toEqual(["AI", "Compilers"]);
    expect(merged.collection?.name).toBe("Language Design");
    expect(merged.confidence).toBe("high");
  });
});

describe("harvestOrbitAcceptedLabels", () => {
  it("collects assigned names and skips abstentions", () => {
    const harvested = harvestOrbitAcceptedLabels([
      {
        bookmarkId: "a",
        confidence: "high",
        reasoning: "ok",
        tags: [{ name: "AI", color: "#1d9bf0", reason: "match" }],
        collection: {
          name: "Research",
          description: "Papers",
          reason: "home",
        },
        needsNewLabel: false,
        abstain: false,
      },
      {
        bookmarkId: "b",
        confidence: "low",
        reasoning: "none",
        tags: [],
        collection: null,
        needsNewLabel: true,
        abstain: true,
      },
    ]);

    expect(harvested.tags.map((tag) => tag.name)).toEqual(["AI"]);
    expect(harvested.collections.map((collection) => collection.name)).toEqual([
      "Research",
    ]);
  });
});

describe("replaceOrbitJevAssignments", () => {
  it("overlays refined leftover assignments by bookmark id", () => {
    const replaced = replaceOrbitJevAssignments(
      [
        {
          bookmarkId: "keep",
          confidence: "high",
          reasoning: "ok",
          tags: [{ name: "AI", color: "#1d9bf0", reason: "match" }],
          collection: null,
          needsNewLabel: false,
          abstain: false,
        },
        {
          bookmarkId: "leftover",
          confidence: "low",
          reasoning: "none",
          tags: [],
          collection: null,
          needsNewLabel: true,
          abstain: true,
        },
      ],
      [
        {
          bookmarkId: "leftover",
          confidence: "medium",
          reasoning: "second pass",
          tags: [{ name: "Compilers", color: "#64748b", reason: "batch" }],
          collection: null,
          needsNewLabel: false,
          abstain: false,
        },
      ]
    );

    expect(replaced[0]?.tags[0]?.name).toBe("AI");
    expect(replaced[1]?.tags[0]?.name).toBe("Compilers");
    expect(replaced[1]?.abstain).toBe(false);
  });
});

describe("mergeOrbitScanPlans", () => {
  it("merges leftover Grok names onto Jev reuse instead of replacing", () => {
    const merged = mergeOrbitScanPlans(
      {
        overview: {
          summary: "Jev assigned 1 of 2.",
          taggingStrategy: "Nouls",
          collectionStrategy: "Choice",
        },
        suggestions: [
          {
            bookmarkId: "keep",
            confidence: "high",
            reasoning: "Jev",
            tags: [{ name: "AI", color: "#1d9bf0", reason: "noul" }],
            collection: null,
          },
          {
            bookmarkId: "leftover",
            confidence: "high",
            reasoning: "Jev matched AI.",
            tags: [{ name: "AI", color: "#1d9bf0", reason: "noul" }],
            collection: null,
          },
        ],
      },
      {
        overview: {
          summary: "Grok leftovers",
          taggingStrategy: "Invent",
          collectionStrategy: "None",
        },
        suggestions: [
          {
            bookmarkId: "leftover",
            confidence: "medium",
            reasoning: "Grok named it",
            tags: [{ name: "Compilers", color: "#64748b", reason: "topic" }],
            collection: null,
          },
        ],
      },
      new Set(["leftover"])
    );

    expect(merged.suggestions[0]?.tags[0]?.name).toBe("AI");
    expect(merged.suggestions[1]).toMatchObject({
      bookmarkId: "leftover",
      confidence: "high",
      tags: [{ name: "AI" }, { name: "Compilers" }],
    });
    expect(merged.overview.summary).toBe("Jev assigned 1 of 2.");
  });
});

describe("refineOrbitJevLeftovers", () => {
  it("retries leftovers preferring only the labels Jev accepted this batch", async () => {
    assignSpy.mockResolvedValueOnce([
      {
        ...abstainAssignment("bm-2"),
        tags: [{ name: "AI", color: "#1d9bf0", reason: "second pass" }],
        confidence: "medium",
        abstain: false,
      },
    ]);

    const result = await refineOrbitJevLeftovers({
      bookmarks: [scanBookmark("bm-1"), scanBookmark("bm-2")],
      assignments: [
        {
          bookmarkId: "bm-1",
          confidence: "high",
          reasoning: "ok",
          tags: [{ name: "AI", color: "#1d9bf0", reason: "match" }],
          collection: null,
          needsNewLabel: false,
          abstain: false,
        },
        abstainAssignment("bm-2"),
      ],
      pool: {
        tags: [
          { name: "AI", existing: true },
          { name: "Cooking", existing: true },
        ],
        collections: [],
      },
      existingTags: [
        { name: "AI", color: "#1d9bf0", bookmarkCount: 4 },
        { name: "Cooking", color: "#222222", bookmarkCount: 40 },
      ],
      existingCollections: [],
    });

    expect(assignSpy).toHaveBeenCalledTimes(1);
    const call = assignSpy.mock.calls[0]?.[0];
    expect(call.bookmarks.map((bookmark: { id: string }) => bookmark.id)).toEqual([
      "bm-2",
    ]);
    // Batch vocabulary is the harvest, not the whole pool: "Cooking" was never
    // accepted this batch, so it must not be promoted to preferred.
    expect(call.batchVocabulary).toEqual({ tags: ["AI"], collections: [] });
    expect(call.pool.tags.map((tag: { name: string }) => tag.name)).toContain(
      "Cooking"
    );
    expect(result.assignments[1]?.abstain).toBe(false);
  });

  it("grows both shortlists by the Grok name increment and prefers those names", async () => {
    assignSpy.mockResolvedValueOnce([abstainAssignment("bm-2")]);

    await refineOrbitJevLeftovers({
      bookmarks: [scanBookmark("bm-1"), scanBookmark("bm-2")],
      assignments: [
        {
          bookmarkId: "bm-1",
          confidence: "high",
          reasoning: "ok",
          tags: [{ name: "AI", color: "#1d9bf0", reason: "match" }],
          collection: {
            name: "Research",
            description: "Papers",
            reason: "home",
          },
          needsNewLabel: false,
          abstain: false,
        },
        abstainAssignment("bm-2"),
      ],
      pool: {
        tags: [{ name: "AI", existing: true }],
        collections: [{ name: "Research", existing: true }],
      },
      existingTags: [{ name: "AI", color: "#1d9bf0", bookmarkCount: 4 }],
      existingCollections: [
        { name: "Research", description: "Papers", bookmarkCount: 2 },
      ],
      proposeLeftoverVocab: async () => ({
        tags: [
          { name: "LLM Evals", existing: false, reason: "papers" },
          { name: "Scaling Laws", existing: false, reason: "laws" },
        ],
        collections: [
          {
            name: "Eval Desk",
            existing: false,
            description: "Evaluation notes.",
            reason: "shared leftover theme",
          },
        ],
      }),
    });

    const call = assignSpy.mock.calls[0]?.[0];
    expect(call.maxTagShortlist).toBe(14);
    expect(call.maxCollectionShortlist).toBe(9);
    expect(call.batchVocabulary).toEqual({
      tags: ["AI", "LLM Evals", "Scaling Laws"],
      collections: ["Research", "Eval Desk"],
    });
    expect(call.pool.tags.map((tag: { name: string }) => tag.name)).toContain(
      "LLM Evals"
    );
    expect(
      call.pool.collections.map((collection: { name: string }) => collection.name)
    ).toContain("Eval Desk");
  });
});

describe("runHybridOrbitScan", () => {
  it("escalates chunks in parallel and only counts merged chunks", async () => {
    const bookmarks = Array.from({ length: 40 }, (_, index) =>
      scanBookmark(`bm-${index}`)
    );
    assignSpy.mockImplementation(
      async (call: { bookmarks: Array<{ id: string }> }) =>
        call.bookmarks.map((bookmark) => abstainAssignment(bookmark.id))
    );

    const result = await runHybridOrbitScan({
      bookmarks,
      existingTags: [],
      existingCollections: [],
      escalateLeftovers: async (chunk) => {
        if (chunk.some((bookmark) => bookmark.id === "bm-0")) {
          throw new Error("xai timeout");
        }
        return {
          overview: {
            summary: "Grok leftovers",
            taggingStrategy: "Invent",
            collectionStrategy: "None",
          },
          suggestions: chunk.map((bookmark) => ({
            bookmarkId: bookmark.id,
            confidence: "medium" as const,
            reasoning: "Grok named it",
            tags: [{ name: "Compilers", color: "#64748b", reason: "gap" }],
            collection: null,
          })),
        };
      },
    });

    expect(result.batch.hybrid).toMatchObject({
      firstPassLeftovers: 40,
      refinedLeftovers: 40,
      recoveredOnRefine: 0,
      escalatedToGrok: 4,
      escalationSkipped: 0,
    });
    const summaryMatches =
      result.plan.overview.summary.match(
        /Suggested tags for 4 bookmarks with no existing match\./g
      ) ?? [];
    expect(summaryMatches).toHaveLength(1);
    expect(result.model).toContain("+");
  });

  it("reports each stage and row as the scan moves", async () => {
    const matched = (bookmarkId: string, tag: string): OrbitJevAssignment => ({
      ...abstainAssignment(bookmarkId),
      tags: [{ name: tag, color: "#1d9bf0", reason: "match" }],
      abstain: false,
      confidence: "high",
    });
    let pass = 0;
    assignSpy.mockImplementation(
      async (call: {
        bookmarks: Array<{ id: string }>;
        onAssigned?: (assignment: OrbitJevAssignment) => void;
      }) => {
        pass += 1;
        return call.bookmarks.map((bookmark) => {
          const assignment =
            bookmark.id === "bm-1"
              ? matched("bm-1", "AI")
              : pass === 2 && bookmark.id === "bm-2"
                ? matched("bm-2", "Cooking")
                : abstainAssignment(bookmark.id);
          call.onAssigned?.(assignment);
          return assignment;
        });
      }
    );
    const events: unknown[] = [];

    await runHybridOrbitScan({
      bookmarks: ["bm-1", "bm-2", "bm-3"].map(scanBookmark),
      existingTags: [],
      existingCollections: [],
      onProgress: (event) => events.push(event),
      escalateLeftovers: async (chunk) => ({
        overview: { summary: "", taggingStrategy: "", collectionStrategy: "" },
        suggestions: chunk.map((bookmark) => ({
          bookmarkId: bookmark.id,
          confidence: "medium" as const,
          reasoning: "Grok named it",
          tags: [{ name: "Compilers", color: "#64748b", reason: "gap" }],
          collection: null,
        })),
      }),
    });

    expect(events).toEqual([
      { type: "phase", phase: "match" },
      { type: "row", bookmarkId: "bm-1", state: "matched", label: "AI" },
      { type: "row", bookmarkId: "bm-2", state: "leftover", label: null },
      { type: "row", bookmarkId: "bm-3", state: "leftover", label: null },
      { type: "phase", phase: "refine", bookmarkIds: ["bm-2", "bm-3"] },
      { type: "row", bookmarkId: "bm-2", state: "matched", label: "Cooking" },
      { type: "row", bookmarkId: "bm-3", state: "leftover", label: null },
      { type: "phase", phase: "name", bookmarkIds: ["bm-3"] },
      { type: "named", bookmarkIds: ["bm-3"] },
    ]);
  });

  it("reports a Jev-only model when Grok never contributed", async () => {
    assignSpy.mockImplementation(
      async (call: { bookmarks: Array<{ id: string }> }) =>
        call.bookmarks.map((bookmark) => ({
          ...abstainAssignment(bookmark.id),
          tags: [{ name: "AI", color: "#1d9bf0", reason: "match" }],
          abstain: false,
          confidence: "high" as const,
        }))
    );

    const result = await runHybridOrbitScan({
      bookmarks: [scanBookmark("bm-1")],
      existingTags: [{ name: "AI", color: "#1d9bf0", bookmarkCount: 4 }],
      existingCollections: [],
    });

    expect(result.model).not.toContain("+");
    expect(result.batch.hybrid).toMatchObject({
      firstPassLeftovers: 0,
      refinedLeftovers: 0,
      recoveredOnRefine: 0,
      escalatedToGrok: 0,
      namedByGrok: 0,
    });
  });

  it("asks Grok for tag options only after Jev leaves gaps", async () => {
    assignSpy.mockImplementation(
      async (call: { bookmarks: Array<{ id: string }> }) =>
        call.bookmarks.map((bookmark) => abstainAssignment(bookmark.id))
    );
    const escalate = vi.fn(
      async (bookmarks: Array<{ id: string }>) => ({
        overview: {
          summary: "Tag options",
          taggingStrategy: "From the post",
          collectionStrategy: "None",
        },
        suggestions: bookmarks.map((bookmark) => ({
          bookmarkId: bookmark.id,
          confidence: "medium" as const,
          reasoning: "No existing tag fit.",
          tags: [{ name: "Compilers", color: "#64748b", reason: "post topic" }],
          collection: null,
        })),
      })
    );

    await runHybridOrbitScan({
      bookmarks: [scanBookmark("bm-1")],
      existingTags: [{ name: "AI", color: "#1d9bf0", bookmarkCount: 4 }],
      existingCollections: [],
      escalateLeftovers: escalate,
    });

    expect(proposeSpy).not.toHaveBeenCalled();
    expect(assignSpy.mock.invocationCallOrder[0]).toBeLessThan(
      escalate.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(escalate).toHaveBeenCalledTimes(1);
    expect(escalate.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ id: "bm-1" }),
    ]);
  });

  it("lets Jev place names Grok proposes before a full Grok assignment", async () => {
    let pass = 0;
    assignSpy.mockImplementation(
      async (call: { bookmarks: Array<{ id: string }>; pool: { tags: Array<{ name: string }> } }) => {
        pass += 1;
        if (pass === 1) {
          return call.bookmarks.map((bookmark) => abstainAssignment(bookmark.id));
        }
        expect(call.pool.tags.map((tag) => tag.name)).toContain("LLM Evals");
        return call.bookmarks.map((bookmark) => ({
          ...abstainAssignment(bookmark.id),
          tags: [{ name: "LLM Evals", color: "#64748b", reason: "placed" }],
          abstain: false,
          confidence: "high" as const,
        }));
      }
    );
    const escalate = vi.fn();

    const result = await runHybridOrbitScan({
      bookmarks: [scanBookmark("bm-1")],
      existingTags: [{ name: "AI", color: "#1d9bf0", bookmarkCount: 4 }],
      existingCollections: [],
      proposeLeftoverVocab: async () => ({
        tags: [{ name: "LLM Evals", existing: false, reason: "leftover papers" }],
        collections: [],
      }),
      escalateLeftovers: escalate,
    });

    expect(pass).toBe(2);
    expect(escalate).not.toHaveBeenCalled();
    expect(result.plan.suggestions[0]?.tags.map((tag) => tag.name)).toContain("LLM Evals");
    expect(result.batch.hybrid?.escalatedToGrok).toBe(0);
  });
});

describe("assignAndRefineOrbitJev", () => {
  it("leaves first-pass batch vocabulary unset unless the caller supplies it", async () => {
    assignSpy.mockImplementation(
      async (call: { bookmarks: Array<{ id: string }> }) =>
        call.bookmarks.map((bookmark) => ({
          ...abstainAssignment(bookmark.id),
          tags: [{ name: "AI", color: "#1d9bf0", reason: "match" }],
          abstain: false,
          confidence: "high" as const,
        }))
    );

    const result = await assignAndRefineOrbitJev({
      bookmarks: [scanBookmark("bm-1")],
      existingTags: [{ name: "AI", color: "#1d9bf0", bookmarkCount: 4 }],
      existingCollections: [],
      pool: { tags: [], collections: [] },
    });

    expect(assignSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ batchVocabulary: undefined })
    );
    expect(result.firstPassLeftovers).toBe(0);
    expect(proposeSpy).not.toHaveBeenCalled();
  });

  it("counts leftovers from the first pass and keeps warm vocabulary off the refine pass", async () => {
    assignSpy
      .mockImplementationOnce(
        async (call: { bookmarks: Array<{ id: string }> }) =>
          call.bookmarks.map((bookmark) => abstainAssignment(bookmark.id))
      )
      .mockImplementationOnce(
        async (call: { bookmarks: Array<{ id: string }> }) =>
          call.bookmarks.map((bookmark) => ({
            ...abstainAssignment(bookmark.id),
            tags: [{ name: "AI", color: "#1d9bf0", reason: "match" }],
            abstain: false,
            confidence: "high" as const,
          }))
      );

    const result = await assignAndRefineOrbitJev({
      bookmarks: [scanBookmark("bm-1")],
      existingTags: [{ name: "AI", color: "#1d9bf0", bookmarkCount: 4 }],
      existingCollections: [],
      pool: { tags: [{ name: "Warm", existing: true }], collections: [] },
      firstPassBatchVocabulary: { tags: ["Warm"], collections: [] },
    });

    expect(result.firstPassLeftovers).toBe(1);
    expect(result.assignments[0]?.abstain).toBe(false);
    expect(assignSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        batchVocabulary: { tags: ["Warm"], collections: [] },
      })
    );
    expect(assignSpy.mock.calls[1]?.[0]?.batchVocabulary).toEqual({
      tags: [],
      collections: [],
    });
  });
});

describe("Grok and Jev interplay", () => {
  const grokPlan = (
    bookmarks: Array<{ id: string }>,
    tags: string[],
    confidence: "high" | "medium" = "high"
  ) => ({
    overview: { summary: "Grok", taggingStrategy: "", collectionStrategy: "" },
    suggestions: bookmarks.map((bookmark) => ({
      bookmarkId: bookmark.id,
      confidence,
      reasoning: "Grok named it",
      tags: tags.map((name) => ({ name, color: "#64748b", reason: "gap" })),
      collection: null,
    })),
  });

  it("keeps only the Grok tags Jev confirms, with Jev's score", async () => {
    assignSpy.mockImplementation(
      async (call: { bookmarks: Array<{ id: string }> }) =>
        call.bookmarks.map((bookmark) => abstainAssignment(bookmark.id))
    );
    verifySpy.mockImplementation(
      async (call: { suggestions: Array<{ bookmarkId: string; reasoning: string; tags: Array<{ name: string; color: string; reason: string }> }> }) =>
        call.suggestions.map((suggestion) => ({
          ...suggestion,
          confidence: "medium" as const,
          // Jev accepts Compilers, rejects Rust.
          tags: suggestion.tags
            .filter((tag) => tag.name === "Compilers")
            .map((tag) => ({ ...tag, score: 0.7, origin: "grok" as const })),
          collection: null,
        }))
    );

    const result = await runHybridOrbitScan({
      bookmarks: [scanBookmark("bm-1")],
      existingTags: [{ name: "Rust", color: "#f97316", bookmarkCount: 3 }],
      existingCollections: [],
      escalateLeftovers: async (chunk) => grokPlan(chunk, ["Compilers", "Rust"]),
    });

    expect(verifySpy).toHaveBeenCalledTimes(1);
    const suggestion = result.plan.suggestions[0];
    expect(suggestion?.tags.map((tag) => tag.name)).toEqual(["Compilers"]);
    expect(suggestion?.tags[0]).toMatchObject({ score: 0.7, origin: "grok" });
    // Grok said "high"; Jev's check decides the confidence.
    expect(suggestion?.confidence).toBe("medium");
  });

  it("skips Grok steps that would run past the deadline and leaves the rows for review", async () => {
    assignSpy.mockImplementation(
      async (call: { bookmarks: Array<{ id: string }> }) =>
        call.bookmarks.map((bookmark) => abstainAssignment(bookmark.id))
    );
    const propose = vi.fn();
    const escalate = vi.fn();

    const result = await runHybridOrbitScan({
      bookmarks: [scanBookmark("bm-1"), scanBookmark("bm-2")],
      existingTags: [],
      existingCollections: [],
      proposeLeftoverVocab: propose,
      escalateLeftovers: escalate,
      deadline: Date.now() + 5_000,
    });

    expect(propose).not.toHaveBeenCalled();
    expect(escalate).not.toHaveBeenCalled();
    expect(result.batch.hybrid?.escalationSkipped).toBe(2);
    expect(result.plan.suggestions.every((suggestion) => suggestion.tags.length === 0)).toBe(true);
    expect(result.model).not.toContain("+");
  });

  it("passes each Grok call its time budget and counts usage", async () => {
    assignSpy.mockImplementation(
      async (call: { bookmarks: Array<{ id: string }> }) =>
        call.bookmarks.map((bookmark) => abstainAssignment(bookmark.id))
    );
    const escalate = vi.fn(
      async (
        chunk: Array<{ id: string }>,
        _notes: unknown,
        options: { timeoutMs: number; onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void }
      ) => {
        options.onUsage?.({ inputTokens: 1200, outputTokens: 300 });
        return grokPlan(chunk, ["Compilers"]);
      }
    );

    const result = await runHybridOrbitScan({
      bookmarks: [scanBookmark("bm-1")],
      existingTags: [],
      existingCollections: [],
      escalateLeftovers: escalate,
      deadline: Date.now() + 100_000,
    });

    const timeoutMs = escalate.mock.calls[0]?.[2]?.timeoutMs ?? 0;
    expect(timeoutMs).toBeGreaterThan(0);
    expect(timeoutMs).toBeLessThanOrEqual(80_000);
    expect(result.batch.hybrid?.usage).toMatchObject({
      grokCalls: 1,
      grokInputTokens: 1200,
      grokOutputTokens: 300,
    });
  });

  it("sends coarse fits to Grok's naming call and adds the narrower name Jev accepts", async () => {
    const coarse: OrbitJevAssignment = {
      ...placedAssignment("bm-1", "Programming", 0.6),
      coarseFit: true,
    };
    let pass = 0;
    assignSpy.mockImplementation(
      async (call: {
        bookmarks: Array<{ id: string }>;
        pool: { tags: Array<{ name: string }> };
        askNewLabelGap?: boolean;
      }) => {
        pass += 1;
        if (pass === 1) return [coarse];
        // The narrowing pass asks only about the new names.
        expect(call.askNewLabelGap).toBe(false);
        expect(call.pool.tags.map((tag) => tag.name)).toEqual(["Rust"]);
        return [
          {
            ...placedAssignment("bm-1", "Rust", 0.88),
            tags: [
              { name: "Rust", color: "#64748b", reason: "new", score: 0.88, origin: "jev_new_name" as const },
            ],
          },
        ];
      }
    );
    const propose = vi.fn(async () => ({
      tags: [{ name: "Rust", existing: false, reason: "narrower" }],
      collections: [],
    }));
    const events: Array<{ type: string; phase?: string }> = [];

    const result = await runHybridOrbitScan({
      bookmarks: [scanBookmark("bm-1")],
      existingTags: [{ name: "Programming", color: "#1d9bf0", bookmarkCount: 9 }],
      existingCollections: [],
      proposeLeftoverVocab: propose,
      onProgress: (event) => events.push(event),
    });

    expect(propose).toHaveBeenCalledTimes(1);
    const notes = (propose.mock.calls[0] as unknown[] | undefined)?.[1] as Array<{
      bookmarkId: string;
      matchedTags: string[];
    }>;
    expect(notes).toEqual([
      expect.objectContaining({ bookmarkId: "bm-1", matchedTags: ["Programming"] }),
    ]);
    // A coarse fit already shows as matched; it never flips back to "naming".
    expect(events.some((event) => event.phase === "name")).toBe(false);
    const tags = result.plan.suggestions[0]?.tags ?? [];
    expect(tags.map((tag) => tag.name)).toEqual(["Rust", "Programming"]);
    expect(tags[0]).toMatchObject({ origin: "jev_new_name", reuseExisting: false });
    expect(result.batch.hybrid).toMatchObject({ coarseFits: 1, namedByGrok: 1, narrowed: 1 });
    expect(result.model).toContain("+");
  });

  it("asks placed bookmarks that name a new tag about it too", async () => {
    let pass = 0;
    assignSpy.mockImplementation(
      async (call: { bookmarks: Array<{ id: string }> }) => {
        pass += 1;
        if (pass === 1) {
          return [placedAssignment("bm-1", "AI", 0.95), abstainAssignment("bm-2")];
        }
        return call.bookmarks.map((bookmark) => abstainAssignment(bookmark.id));
      }
    );

    await runHybridOrbitScan({
      bookmarks: [scanBookmark("bm-1"), scanBookmark("bm-2")],
      existingTags: [{ name: "AI", color: "#1d9bf0", bookmarkCount: 9 }],
      existingCollections: [],
      // scanBookmark's text mentions "scaling laws".
      proposeLeftoverVocab: async () => ({
        tags: [{ name: "Scaling Laws", existing: false }],
        collections: [],
      }),
    });

    // Pass 2 re-asks the leftover; pass 3 narrows bm-1, which names the tag.
    expect(pass).toBe(3);
    expect(assignSpy.mock.calls[2]?.[0].bookmarks.map((bookmark: { id: string }) => bookmark.id)).toEqual(["bm-1"]);
  });
});
