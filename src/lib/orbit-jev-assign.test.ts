import { describe, expect, it } from "vitest";

import {
  buildJevAssignmentFromAnswers,
  jevAssignmentsToRawPlan,
  mapJevScoreToConfidence,
  shortlistOrbitCollectionsForJev,
  shortlistOrbitTagsForJev,
} from "@/lib/orbit-jev-assign";
import { buildBookmarkPayload } from "@/lib/orbit-grok-normalize";
import type { OrbitBookmarkForScan } from "@/lib/orbit-grok-schemas";

function bookmark(overrides?: Partial<OrbitBookmarkForScan>): OrbitBookmarkForScan {
  return {
    id: "bm-1",
    tweetId: "1",
    authorUsername: "researcher",
    authorDisplayName: "Researcher",
    authorVerified: false,
    tweetText: "AI research notes on scaling laws for LLM evaluations.",
    tweetCreatedAt: new Date("2026-01-01"),
    bookmarkedAt: new Date("2026-01-02"),
    publicMetrics: null,
    media: null,
    urls: [
      {
        expanded_url: "https://arxiv.org/abs/2410.00001",
        title: "Scaling laws",
      },
    ],
    quotedTweet: null,
    notes: [],
    ...overrides,
  };
}

describe("mapJevScoreToConfidence", () => {
  it("maps strong evidence to high and weak evidence to low", () => {
    expect(mapJevScoreToConfidence(2, 0.9, 0.8)).toBe("high");
    expect(mapJevScoreToConfidence(1, 0.6, null)).toBe("medium");
    expect(mapJevScoreToConfidence(0, 0.2, 0.1)).toBe("low");
  });
});

describe("shortlistOrbitTagsForJev", () => {
  it("prefers matched and proposed names over unused existing tags", () => {
    const payload = buildBookmarkPayload({
      bookmark: bookmark(),
      existingTags: [
        { name: "AI", color: "#111111", bookmarkCount: 12 },
        { name: "Cooking", color: "#222222", bookmarkCount: 40 },
      ],
      existingCollections: [],
    });

    const shortlist = shortlistOrbitTagsForJev({
      pool: [
        { name: "Cooking", existing: true },
        { name: "AI", existing: true },
        { name: "LLM Evals", existing: false },
      ],
      payload,
      maxCount: 2,
    });

    expect(shortlist.map((item) => item.name)).toEqual(["AI", "LLM Evals"]);
  });

  it("ranks unused existing tags by lexical overlap with the bookmark", () => {
    const payload = buildBookmarkPayload({
      bookmark: bookmark({
        tweetText: "Notes on rustc borrow checker regressions.",
      }),
      existingTags: [
        { name: "Cooking", color: "#222222", bookmarkCount: 40 },
        { name: "Rust", color: "#dea584", bookmarkCount: 2 },
      ],
      existingCollections: [],
    });

    const shortlist = shortlistOrbitTagsForJev({
      pool: [
        { name: "Cooking", existing: true },
        { name: "Rust", existing: true },
      ],
      payload,
      maxCount: 2,
    });

    expect(shortlist[0]?.name).toBe("Rust");
  });

  it("reserves lexical matches when Grok proposes many new names", () => {
    const payload = buildBookmarkPayload({
      bookmark: bookmark({
        tweetText: "Notes on rustc borrow checker regressions.",
      }),
      existingTags: [
        { name: "Rust", color: "#dea584", bookmarkCount: 2 },
        { name: "Cooking", color: "#222222", bookmarkCount: 40 },
      ],
      existingCollections: [],
    });

    const shortlist = shortlistOrbitTagsForJev({
      pool: [
        { name: "Rust", existing: true },
        { name: "Cooking", existing: true },
        ...Array.from({ length: 12 }, (_, index) => ({
          name: `Proposed ${index}`,
          existing: false as const,
        })),
      ],
      payload,
      maxCount: 12,
    });

    expect(shortlist.map((item) => item.name)).toContain("Rust");
    expect(
      shortlist.filter((item) => !item.existing).length
    ).toBeLessThanOrEqual(4);
  });

  it("clamps the shortlist when the batch vocabulary is larger than the budget", () => {
    const manyTags = Array.from({ length: 30 }, (_, index) => `Topic ${index}`);
    const payload = buildBookmarkPayload({
      bookmark: bookmark(),
      existingTags: manyTags.map((name) => ({
        name,
        color: "#333333",
        bookmarkCount: 1,
      })),
      existingCollections: [],
    });

    const shortlist = shortlistOrbitTagsForJev({
      pool: manyTags.map((name) => ({ name, existing: true })),
      payload,
      maxCount: 12,
      batchVocabulary: { tags: manyTags, collections: [] },
    });

    expect(shortlist).toHaveLength(12);
  });

  it("promotes names accepted earlier in the same batch", () => {
    const payload = buildBookmarkPayload({
      bookmark: bookmark(),
      existingTags: [{ name: "Cooking", color: "#222222", bookmarkCount: 40 }],
      existingCollections: [],
    });

    const shortlist = shortlistOrbitTagsForJev({
      pool: [
        { name: "Cooking", existing: true },
        { name: "LLM Evals", existing: true },
      ],
      payload,
      maxCount: 1,
      batchVocabulary: { tags: ["LLM Evals"], collections: [] },
    });

    expect(shortlist.map((item) => item.name)).toEqual(["LLM Evals"]);
  });
});

describe("shortlistOrbitCollectionsForJev", () => {
  it("keeps none-eligible collections ranked with matches first", () => {
    const payload = buildBookmarkPayload({
      bookmark: bookmark(),
      existingTags: [],
      existingCollections: [{ name: "Research", description: null, bookmarkCount: 3 }],
    });

    const shortlist = shortlistOrbitCollectionsForJev({
      pool: [
        { name: "Travel", existing: true },
        { name: "Research", existing: true },
      ],
      payload,
    });

    expect(shortlist[0]?.name).toBe("Research");
  });

  it("caps proposed collections so existing ones stay on the choice list", () => {
    const payload = buildBookmarkPayload({
      bookmark: bookmark(),
      existingTags: [],
      existingCollections: [
        { name: "Research", description: null, bookmarkCount: 3 },
      ],
    });

    const shortlist = shortlistOrbitCollectionsForJev({
      pool: [
        { name: "Research", existing: true },
        { name: "Travel", existing: true },
        ...Array.from({ length: 8 }, (_, index) => ({
          name: `Proposed Home ${index}`,
          existing: false as const,
        })),
      ],
      payload,
    });

    expect(shortlist.map((item) => item.name)).toContain("Travel");
    expect(shortlist.filter((item) => !item.existing).length).toBeLessThanOrEqual(4);
  });
});

describe("buildJevAssignmentFromAnswers", () => {
  const tags = [
    { name: "AI", existing: true },
    { name: "Design", existing: true },
  ];
  const collections = [{ name: "Research", existing: true, description: "Papers" }];

  it("includes tags above the noul threshold and maps high confidence", () => {
    const assignment = buildJevAssignmentFromAnswers({
      bookmarkId: "bm-1",
      tagShortlist: tags,
      collectionShortlist: collections,
      tagNouls: { tag_0: 0.88, tag_1: 0.12 },
      collectionChoice: "coll_0",
      collectionConfidence: 0.81,
      needsNewLabel: 0.1,
      matchScore: 1.8,
      existingTags: [{ name: "AI", color: "#1d9bf0" }],
    });

    expect(assignment.tags.map((tag) => tag.name)).toEqual(["AI"]);
    expect(assignment.collection?.name).toBe("Research");
    expect(assignment.confidence).toBe("high");
    expect(assignment.abstain).toBe(false);
  });

  it("abstains when every noul is weak and needs_new_label is high", () => {
    const assignment = buildJevAssignmentFromAnswers({
      bookmarkId: "bm-1",
      tagShortlist: tags,
      collectionShortlist: collections,
      tagNouls: { tag_0: 0.2, tag_1: 0.1 },
      collectionChoice: "none",
      collectionConfidence: 0.9,
      needsNewLabel: 0.86,
      matchScore: 0.2,
      existingTags: [],
    });

    expect(assignment.tags).toEqual([]);
    expect(assignment.collection).toBeNull();
    expect(assignment.needsNewLabel).toBe(true);
    expect(assignment.abstain).toBe(true);
    expect(assignment.confidence).toBe("low");
  });
});

describe("jevAssignmentsToRawPlan", () => {
  it("keeps one suggestion per assignment", () => {
    const plan = jevAssignmentsToRawPlan([
      {
        bookmarkId: "bm-1",
        confidence: "high",
        reasoning: "Assigned",
        tags: [{ name: "AI", color: "#1d9bf0", reason: "match" }],
        collection: null,
        needsNewLabel: false,
        abstain: false,
      },
    ]);

    expect(plan.suggestions).toHaveLength(1);
    expect(plan.suggestions[0]?.tags[0]?.name).toBe("AI");
  });
});
