import { describe, expect, it } from "vitest";
import {
  buildBookmarkDecision,
  buildSingleSuggestionPlan,
  derivePrimaryAndAlternative,
  formatConfidence,
} from "@/lib/orbit-decision";
import type { OrbitBookmarkSuggestion, OrbitScanPlan } from "@/types";

const baseSuggestion: OrbitBookmarkSuggestion = {
  bookmarkId: "b1",
  confidence: "high",
  reasoning: "Reasoning",
  tags: [
    {
      name: "Research",
      color: "#1d9bf0",
      reason: "Topic",
      reuseExisting: true,
    },
    {
      name: "Tools",
      color: "#22c55e",
      reason: "Secondary",
      reuseExisting: false,
    },
  ],
  collection: {
    name: "Deep Work",
    description: "Focused reads",
    reason: "Clear home",
    reuseExisting: false,
  },
};

describe("derivePrimaryAndAlternative", () => {
  it("prefers a collection home as primary and the top tag as alt", () => {
    const result = derivePrimaryAndAlternative(baseSuggestion);
    expect(result.primary).toMatchObject({
      kind: "collection",
      label: "Deep Work",
      reuseExisting: false,
    });
    expect(result.alternative).toMatchObject({
      kind: "tag",
      label: "Research",
      reuseExisting: true,
    });
  });

  it("falls back to top tag as primary and second tag as alt", () => {
    const result = derivePrimaryAndAlternative({
      ...baseSuggestion,
      collection: null,
    });
    expect(result.primary).toMatchObject({ kind: "tag", label: "Research" });
    expect(result.alternative).toMatchObject({ kind: "tag", label: "Tools" });
  });

  it("returns nulls when the suggestion has no content", () => {
    const result = derivePrimaryAndAlternative({
      ...baseSuggestion,
      tags: [],
      collection: null,
    });
    expect(result.primary).toBeNull();
    expect(result.alternative).toBeNull();
  });
});

describe("buildBookmarkDecision", () => {
  it("carries reasoning and confidence through", () => {
    const decision = buildBookmarkDecision(baseSuggestion);
    expect(decision.bookmarkId).toBe("b1");
    expect(decision.confidence).toBe("high");
    expect(decision.reasoning).toBe("Reasoning");
    expect(decision.primary?.kind).toBe("collection");
    expect(decision.alternative?.kind).toBe("tag");
  });
});

describe("formatConfidence", () => {
  it("maps tri-state confidence to percent copy", () => {
    expect(formatConfidence("high")).toBe("91% confidence");
    expect(formatConfidence("medium")).toBe("68% confidence");
    expect(formatConfidence("low")).toBe("42% confidence");
  });
});

describe("buildSingleSuggestionPlan", () => {
  const plan: OrbitScanPlan = {
    overview: {
      summary: "Summary",
      taggingStrategy: "Tags",
      collectionStrategy: "Collections",
    },
    suggestions: [baseSuggestion],
  };

  it("builds a collection-only plan for primary when a collection exists", () => {
    const result = buildSingleSuggestionPlan(plan, "b1", "primary");
    expect(result?.suggestions).toHaveLength(1);
    expect(result?.suggestions[0].tags).toHaveLength(0);
    expect(result?.suggestions[0].collection?.name).toBe("Deep Work");
  });

  it("builds a single-tag plan for alt when primary is a collection", () => {
    const result = buildSingleSuggestionPlan(plan, "b1", "alt");
    expect(result?.suggestions[0].tags).toHaveLength(1);
    expect(result?.suggestions[0].tags[0].name).toBe("Research");
    expect(result?.suggestions[0].collection).toBeNull();
  });

  it("builds a single-tag plan for primary when there is no collection", () => {
    const tagOnlyPlan: OrbitScanPlan = {
      ...plan,
      suggestions: [{ ...baseSuggestion, collection: null }],
    };
    const result = buildSingleSuggestionPlan(tagOnlyPlan, "b1", "primary");
    expect(result?.suggestions[0].tags).toHaveLength(1);
    expect(result?.suggestions[0].tags[0].name).toBe("Research");
    expect(result?.suggestions[0].collection).toBeNull();
  });

  it("returns null when there is no matching suggestion", () => {
    expect(buildSingleSuggestionPlan(plan, "missing", "primary")).toBeNull();
  });

  it("returns null when alt is requested but unavailable", () => {
    const singleTag: OrbitScanPlan = {
      ...plan,
      suggestions: [
        { ...baseSuggestion, tags: [baseSuggestion.tags[0]], collection: null },
      ],
    };
    expect(buildSingleSuggestionPlan(singleTag, "b1", "alt")).toBeNull();
  });
});
