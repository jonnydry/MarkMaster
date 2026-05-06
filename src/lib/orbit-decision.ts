import type {
  OrbitBookmarkDecision,
  OrbitBookmarkSuggestion,
  OrbitDecision,
  OrbitScanConfidence,
  OrbitScanPlan,
} from "@/types";

/** Grok returns tri-state confidence only — surface qualitative labels, not fake percentages. */
const CONFIDENCE_LABEL: Record<OrbitScanConfidence, string> = {
  high: "Strong match",
  medium: "Reasonable guess",
  low: "Uncertain",
};

export function confidenceLabel(confidence: OrbitScanConfidence): string {
  return CONFIDENCE_LABEL[confidence];
}

/** Tooltip / assistive copy explaining that confidence is qualitative. */
export function formatConfidence(confidence: OrbitScanConfidence): string {
  return `${CONFIDENCE_LABEL[confidence]} (qualitative, not a score)`;
}

/** Whether applying this plan may need to create new collection rows. */
export function shouldCreateCollectionsForPlan(plan: OrbitScanPlan): boolean {
  return plan.suggestions.some(
    (suggestion) =>
      suggestion.collection !== null && !suggestion.collection.reuseExisting
  );
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
  const suggestedTags = suggestion.tags.map((tag) => ({
    name: tag.name,
    color: tag.color,
  }));
  return {
    bookmarkId: suggestion.bookmarkId,
    confidence: suggestion.confidence,
    reasoning: suggestion.reasoning,
    primary,
    alternative,
    suggestedTags,
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
