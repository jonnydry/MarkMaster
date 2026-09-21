import { beforeEach, describe, expect, it, vi } from "vitest";

import { ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN } from "@/lib/orbit-config";
import {
  assignAndRefineOrbitJev,
  chunkItems,
  computeOrbitHybridScanMetrics,
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

vi.mock("@/lib/orbit-jev-assign", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orbit-jev-assign")>();
  return { ...actual, assignOrbitBookmarksWithJev: assignSpy };
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
  };
}

beforeEach(() => {
  assignSpy.mockReset();
  proposeSpy.mockReset();
  proposeSpy.mockResolvedValue({ tags: [], collections: [] });
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
    });
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

    expect(result.batch.hybrid).toEqual({
      firstPassLeftovers: 40,
      refinedLeftovers: 40,
      recoveredOnRefine: 0,
      escalatedToGrok: 4,
    });
    const summaryMatches =
      result.plan.overview.summary.match(
        /Suggested tags for 4 bookmarks with no existing match\./g
      ) ?? [];
    expect(summaryMatches).toHaveLength(1);
    expect(result.model).toContain("+");
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
    expect(result.batch.hybrid).toEqual({
      firstPassLeftovers: 0,
      refinedLeftovers: 0,
      recoveredOnRefine: 0,
      escalatedToGrok: 0,
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
