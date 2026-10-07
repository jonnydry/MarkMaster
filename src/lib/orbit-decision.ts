import type {
  OrbitBookmarkDecision,
  OrbitBookmarkSuggestion,
  OrbitDecision,
  OrbitScanConfidence,
  OrbitScanPlan,
} from "@/types";
import { ORBIT_JEV_TAG_STRONG_THRESHOLD } from "@/lib/orbit-config";
import { isVideoFormatTag } from "@/lib/orbit-video-tag";

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

/**
 * A label is strong enough to apply unreviewed when Jev scored it at the
 * strong threshold. Grok-only scans carry no scores; there the suggestion's
 * own "high" confidence is all there is to go on.
 */
function isStrongLabel(label: { score?: number }) {
  return label.score === undefined || label.score >= ORBIT_JEV_TAG_STRONG_THRESHOLD;
}

/**
 * Guardrail for one-click/batch automation: the part of a high-confidence
 * suggestion that is safe to apply unreviewed, or null when nothing is.
 *
 * Only labels that reuse the user's existing tags or collections and that Jev
 * scored as strong are kept — one strong tag no longer carries weaker ones
 * along. A suggestion that names a new tag keeps its tags for Review, where
 * the user can inspect them; its reusable collection may still apply.
 */
export function safeAutoApplySubset(
  suggestion: OrbitBookmarkSuggestion
): OrbitBookmarkSuggestion | null {
  if (suggestion.confidence !== "high") return null;

  const topicalTags = suggestion.tags.filter((tag) => !isVideoFormatTag(tag));
  const namesNewTag = topicalTags.some((tag) => !tag.reuseExisting);
  const strongTags = namesNewTag
    ? []
    : topicalTags.filter((tag) => isStrongLabel(tag));
  const collection =
    suggestion.collection?.reuseExisting && isStrongLabel(suggestion.collection)
      ? suggestion.collection
      : null;

  if (strongTags.length === 0 && !collection) return null;
  return {
    ...suggestion,
    tags: [...strongTags, ...suggestion.tags.filter(isVideoFormatTag)],
    collection,
  };
}

export function isSafeAutoApplySuggestion(
  suggestion: OrbitBookmarkSuggestion
): boolean {
  return safeAutoApplySubset(suggestion) !== null;
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
          tags: suggestion.tags,
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
