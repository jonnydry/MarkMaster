import type {
  CollectionWithCount,
  OrbitBookmarkSuggestion,
  OrbitCollectionSuggestion,
  OrbitScanPlan,
  OrbitTagSuggestion,
  TagWithCount,
} from "@/types";
import type { AuthorDecisionHistory } from "@/lib/orbit-author-history";
import type { SimilarCollectionItem, SimilarCollections } from "@/lib/orbit-similar-collections";

const DEFAULT_REVIEW_TAG_COLORS = [
  "#1d9bf0",
  "#2563eb",
  "#38bdf8",
  "#60a5fa",
  "#71717a",
] as const;

export type OrbitReviewDecision =
  | "keep"
  | "tags"
  | "collection"
  | "tags_collection";

export interface OrbitReviewSuggestionDraft {
  bookmarkId: string;
  included: boolean;
  decision: OrbitReviewDecision;
  tagNames: string;
  collectionName: string;
  collectionDescription: string;
}

interface BuildReviewedOrbitPlanArgs {
  sourcePlan: OrbitScanPlan;
  drafts: OrbitReviewSuggestionDraft[];
  existingTags: TagWithCount[];
  existingCollections: CollectionWithCount[];
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function truncate(value: string, maxLength: number): string {
  return normalizeWhitespace(value).slice(0, maxLength);
}

export function splitTagNames(value: string): string[] {
  const deduped = new Map<string, string>();

  for (const rawName of value.split(/[,\n]/)) {
    const name = truncate(rawName, 50);
    const key = normalizeKey(name);
    if (!key || deduped.has(key)) continue;
    deduped.set(key, name);
  }

  return Array.from(deduped.values()).slice(0, 3);
}

export function orbitReviewDecisionUsesTags(
  decision: OrbitReviewDecision
): boolean {
  return decision === "tags" || decision === "tags_collection";
}

export function orbitReviewDecisionUsesCollection(
  decision: OrbitReviewDecision
): boolean {
  return decision === "collection" || decision === "tags_collection";
}

export function deriveReviewDecision(
  suggestion: OrbitScanPlan["suggestions"][number]
): OrbitReviewDecision {
  const hasTags = suggestion.tags.length > 0;
  const hasCollection = Boolean(suggestion.collection);

  if (hasTags && hasCollection) return "tags_collection";
  if (hasTags) return "tags";
  if (hasCollection) return "collection";
  return "keep";
}

export function createOrbitReviewDraftFromSuggestion(
  suggestion: OrbitBookmarkSuggestion
): OrbitReviewSuggestionDraft {
  const decision = deriveReviewDecision(suggestion);
  return {
    bookmarkId: suggestion.bookmarkId,
    included: decision !== "keep",
    decision,
    tagNames: suggestion.tags.map((tag) => tag.name).join(", "),
    collectionName: suggestion.collection?.name ?? "",
    collectionDescription: suggestion.collection?.description ?? "",
  };
}

export function createOrbitReviewDraft(
  plan: OrbitScanPlan
): OrbitReviewSuggestionDraft[] {
  return plan.suggestions.map((suggestion) =>
    createOrbitReviewDraftFromSuggestion(suggestion)
  );
}

export interface OrbitReviewAppliedImpact {
  tagNames: string[];
  collectionName: string | null;
}

export function getDraftAppliedImpact(
  draft: OrbitReviewSuggestionDraft
): OrbitReviewAppliedImpact {
  const tagNames = orbitReviewDecisionUsesTags(draft.decision)
    ? splitTagNames(draft.tagNames)
    : [];
  const collectionName =
    orbitReviewDecisionUsesCollection(draft.decision) &&
    draft.collectionName.trim()
      ? draft.collectionName.trim()
      : null;

  return { tagNames, collectionName };
}

export function getGrokProposedImpact(
  original: OrbitBookmarkSuggestion | null | undefined
): OrbitReviewAppliedImpact {
  if (!original) return { tagNames: [], collectionName: null };

  return {
    tagNames: original.tags.map((tag) => tag.name),
    collectionName: original.collection?.name ?? null,
  };
}

export interface OrbitReviewBatchImpactSummary {
  tagNames: string[];
  collectionNames: string[];
}

export function summarizeReviewBatchImpact(
  drafts: OrbitReviewSuggestionDraft[]
): OrbitReviewBatchImpactSummary {
  const tagNames = new Map<string, string>();
  const collectionNames = new Map<string, string>();

  for (const draft of drafts) {
    const impact = getDraftAppliedImpact(draft);
    for (const tag of impact.tagNames) {
      const key = normalizeKey(tag);
      if (!tagNames.has(key)) tagNames.set(key, tag);
    }
    if (impact.collectionName) {
      const key = normalizeKey(impact.collectionName);
      if (!collectionNames.has(key)) {
        collectionNames.set(key, impact.collectionName);
      }
    }
  }

  return {
    tagNames: Array.from(tagNames.values()),
    collectionNames: Array.from(collectionNames.values()),
  };
}

export function buildReviewedOrbitPlan({
  sourcePlan,
  drafts,
  existingTags,
  existingCollections,
}: BuildReviewedOrbitPlanArgs): OrbitScanPlan {
  const sourceSuggestionById = new Map(
    sourcePlan.suggestions.map((suggestion) => [suggestion.bookmarkId, suggestion])
  );
  const existingTagByKey = new Map(
    existingTags.map((tag) => [normalizeKey(tag.name), tag])
  );
  const existingCollectionByKey = new Map(
    existingCollections.map((collection) => [
      normalizeKey(collection.name),
      collection,
    ])
  );

  const suggestions = drafts.flatMap((draft) => {
    if (!draft.included || draft.decision === "keep") return [];

    const sourceSuggestion = sourceSuggestionById.get(draft.bookmarkId);
    if (!sourceSuggestion) return [];

    const sourceTagByKey = new Map(
      sourceSuggestion.tags.map((tag) => [normalizeKey(tag.name), tag])
    );
    const tags: OrbitTagSuggestion[] = orbitReviewDecisionUsesTags(
      draft.decision
    )
      ? splitTagNames(draft.tagNames).map((tagName, index) => {
          const tagKey = normalizeKey(tagName);
          const existingTag = existingTagByKey.get(tagKey);
          const sourceTag = sourceTagByKey.get(tagKey);

          return {
            name: existingTag?.name ?? tagName,
            color:
              existingTag?.color ??
              sourceTag?.color ??
              DEFAULT_REVIEW_TAG_COLORS[index % DEFAULT_REVIEW_TAG_COLORS.length],
            reason: sourceTag?.reason ?? "Edited during Orbit review.",
            reuseExisting: Boolean(existingTag) || sourceTag?.reuseExisting === true,
          };
        })
      : [];

    const collectionName = truncate(draft.collectionName, 100);
    let collection: OrbitCollectionSuggestion | null = null;

    if (orbitReviewDecisionUsesCollection(draft.decision) && collectionName) {
      const collectionKey = normalizeKey(collectionName);
      const existingCollection = existingCollectionByKey.get(collectionKey);
      const sourceCollection =
        sourceSuggestion.collection &&
        normalizeKey(sourceSuggestion.collection.name) === collectionKey
          ? sourceSuggestion.collection
          : null;
      const description =
        truncate(draft.collectionDescription, 240) ||
        truncate(
          existingCollection?.description ??
            sourceCollection?.description ??
            `Reviewed Orbit destination for ${collectionName}.`,
          240
        );

      collection = {
        name: existingCollection?.name ?? collectionName,
        description,
        reason: sourceCollection?.reason ?? "Edited during Orbit review.",
        reuseExisting:
          Boolean(existingCollection) || sourceCollection?.reuseExisting === true,
      };
    }

    if (tags.length === 0 && !collection) return [];

    return [
      {
        bookmarkId: sourceSuggestion.bookmarkId,
        confidence: sourceSuggestion.confidence,
        reasoning: sourceSuggestion.reasoning,
        tags,
        collection,
      },
    ];
  });

  return {
    overview: sourcePlan.overview,
    suggestions,
  };
}

/**
 * Pure client-side helper for Slice 3 (Item 10).
 * Derives a conservative patch for Quick Pass one-click "Accept Orbit suggestion".
 *
 * Always falls back to the original Grok suggestion fields.
 * When real (non-loading) authorHistory or similarCollections are supplied,
 * applies repeatable signals conservatively:
 * - Strong author history (priorCount >= 2) steers tagNames (and decision if not high-conf keep).
 * - History collections or most-common from similar high-performers steer collectionName (never on high-conf keep).
 * - Never overrides a high-confidence "keep" from the original suggestion.
 * - Never introduces new API/Grok work; pure derivation from already-fetched Item 9 data.
 *
 * Returns null only on bad input; otherwise a partial draft patch (decision + tagNames + collection*).
 * The caller applies via updateDraft + sets `included` appropriately.
 */
export function getQuickSmartPatch(
  original: OrbitBookmarkSuggestion,
  authorHistory: AuthorDecisionHistory | null | undefined,
  similarCollections: SimilarCollections | null | undefined
): Partial<OrbitReviewSuggestionDraft> | null {
  if (!original) return null;

  const baseDecision = deriveReviewDecision(original);
  const base: Partial<OrbitReviewSuggestionDraft> = {
    decision: baseDecision,
    tagNames: original.tags.map((t) => t.name).join(", "),
    collectionName: original.collection?.name ?? "",
    collectionDescription: original.collection?.description ?? "",
  };

  // Real non-loading signals only (loading sentinels or null produce pure original fallback)
  const realHistory =
    authorHistory && !("loading" in authorHistory)
      ? (authorHistory as {
          authorUsername: string;
          priorCount: number;
          tags: string[];
          collections: string[];
        })
      : null;

  const realSimilar = Array.isArray(similarCollections) ? similarCollections : null;

  if (!realHistory && !realSimilar) {
    return base;
  }

  let decision = baseDecision;
  let tagNames = base.tagNames ?? "";
  let collectionName = base.collectionName ?? "";
  const collectionDescription = base.collectionDescription ?? "";

  const priorCount = realHistory?.priorCount ?? 0;
  const hasStrongHistory = priorCount >= 2;
  const origConf = original.confidence;

  // History tag steering (conservative: no override of high-conf keep)
  if (hasStrongHistory && realHistory && realHistory.tags.length > 0) {
    const topTags = realHistory.tags.slice(0, 3).join(", ");
    const canSteerToTags =
      orbitReviewDecisionUsesTags(decision) || origConf !== "high";
    if (canSteerToTags) {
      tagNames = topTags;
      if (!orbitReviewDecisionUsesTags(decision) && origConf !== "high") {
        decision = realHistory.collections && realHistory.collections.length > 0
          ? "tags_collection"
          : "tags";
      }
    }
  }

  // Collection preference: author history first (if strong), else most-frequent from similar high-performers
  let preferredCollection: string | null = null;
  if (realHistory && realHistory.collections.length > 0 && priorCount >= 2) {
    preferredCollection = realHistory.collections[0];
  } else if (realSimilar && realSimilar.length > 0) {
    const collCounts = new Map<string, number>();
    for (const item of realSimilar as SimilarCollectionItem[]) {
      for (const c of item.sharedCollections ?? []) {
        collCounts.set(c, (collCounts.get(c) || 0) + 1);
      }
    }
    if (collCounts.size > 0) {
      preferredCollection = Array.from(collCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];
    }
  }

  if (preferredCollection) {
    const canSteerToCol =
      orbitReviewDecisionUsesCollection(decision) || origConf !== "high";
    if (canSteerToCol) {
      collectionName = preferredCollection;
      if (!orbitReviewDecisionUsesCollection(decision)) {
        decision = orbitReviewDecisionUsesTags(decision) ? "tags_collection" : "collection";
      }
    }
  }

  return {
    decision,
    tagNames,
    collectionName,
    collectionDescription,
  };
}
