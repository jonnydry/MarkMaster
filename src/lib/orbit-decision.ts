import type {
  OrbitBookmarkDecision,
  OrbitBookmarkSuggestion,
  OrbitDecision,
  OrbitScanConfidence,
  OrbitScanPlan,
} from "@/types";

/**
 * Confidence labels → percent-style copy for the UI.
 * Grok only ever returns a tri-state confidence, so we map it to an
 * approximate percent range that matches the Paper artboards (e.g. "91% confidence").
 */
const CONFIDENCE_PERCENT: Record<OrbitScanConfidence, number> = {
  high: 91,
  medium: 68,
  low: 42,
};

export function confidencePercent(confidence: OrbitScanConfidence): number {
  return CONFIDENCE_PERCENT[confidence];
}

export function formatConfidence(confidence: OrbitScanConfidence): string {
  return `${CONFIDENCE_PERCENT[confidence]}% confidence`;
}

function tagDecision(
  tag: OrbitBookmarkSuggestion["tags"][number],
  confidence: OrbitScanConfidence
): OrbitDecision {
  return {
    kind: "tag",
    label: tag.name,
    color: tag.color,
    reuseExisting: tag.reuseExisting,
    confidence,
  };
}

function collectionDecision(
  collection: NonNullable<OrbitBookmarkSuggestion["collection"]>,
  confidence: OrbitScanConfidence
): OrbitDecision {
  return {
    kind: "collection",
    label: collection.name,
    reuseExisting: collection.reuseExisting,
    confidence,
  };
}

/**
 * Pick the primary move (prefer a collection home over a tag) and the best
 * alternative. This derives two visible actions from Grok's existing response
 * without expanding the prompt schema.
 */
export function derivePrimaryAndAlternative(
  suggestion: OrbitBookmarkSuggestion
): { primary: OrbitDecision | null; alternative: OrbitDecision | null } {
  const [firstTag, secondTag] = suggestion.tags;

  if (suggestion.collection) {
    return {
      primary: collectionDecision(suggestion.collection, suggestion.confidence),
      alternative: firstTag
        ? tagDecision(firstTag, suggestion.confidence)
        : null,
    };
  }

  if (firstTag) {
    return {
      primary: tagDecision(firstTag, suggestion.confidence),
      alternative: secondTag
        ? tagDecision(secondTag, suggestion.confidence)
        : null,
    };
  }

  return { primary: null, alternative: null };
}

export function buildBookmarkDecision(
  suggestion: OrbitBookmarkSuggestion
): OrbitBookmarkDecision {
  const { primary, alternative } = derivePrimaryAndAlternative(suggestion);
  return {
    bookmarkId: suggestion.bookmarkId,
    confidence: suggestion.confidence,
    reasoning: suggestion.reasoning,
    primary,
    alternative,
  };
}

/**
 * Build a single-suggestion plan carrying either the primary move or the alt.
 * Used by per-card Apply / Alt actions so they can reuse the existing
 * `POST /api/orbit/scan` apply endpoint without any backend changes.
 */
export function buildSingleSuggestionPlan(
  plan: OrbitScanPlan,
  bookmarkId: string,
  variant: "primary" | "alt"
): OrbitScanPlan | null {
  const suggestion = plan.suggestions.find(
    (entry) => entry.bookmarkId === bookmarkId
  );
  if (!suggestion) return null;

  const { primary, alternative } = derivePrimaryAndAlternative(suggestion);
  const chosen = variant === "primary" ? primary : alternative;
  if (!chosen) return null;

  if (chosen.kind === "collection") {
    const collection = suggestion.collection;
    if (!collection) return null;

    return {
      overview: plan.overview,
      suggestions: [
        {
          bookmarkId: suggestion.bookmarkId,
          confidence: suggestion.confidence,
          reasoning: suggestion.reasoning,
          tags: [],
          collection,
        },
      ],
    };
  }

  const tag = suggestion.tags.find((entry) => entry.name === chosen.label);
  if (!tag) return null;

  return {
    overview: plan.overview,
    suggestions: [
      {
        bookmarkId: suggestion.bookmarkId,
        confidence: suggestion.confidence,
        reasoning: suggestion.reasoning,
        tags: [tag],
        collection: null,
      },
    ],
  };
}
