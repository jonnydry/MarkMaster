import type {
  CollectionWithCount,
  OrbitCollectionSuggestion,
  OrbitScanPlan,
  OrbitTagSuggestion,
  TagWithCount,
} from "@/types";

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

function deriveReviewDecision(
  suggestion: OrbitScanPlan["suggestions"][number]
): OrbitReviewDecision {
  const hasTags = suggestion.tags.length > 0;
  const hasCollection = Boolean(suggestion.collection);

  if (hasTags && hasCollection) return "tags_collection";
  if (hasTags) return "tags";
  if (hasCollection) return "collection";
  return "keep";
}

export function createOrbitReviewDraft(
  plan: OrbitScanPlan
): OrbitReviewSuggestionDraft[] {
  return plan.suggestions.map((suggestion) => {
    const decision = deriveReviewDecision(suggestion);

    return {
      bookmarkId: suggestion.bookmarkId,
      included: decision !== "keep",
      decision,
      tagNames: suggestion.tags.map((tag) => tag.name).join(", "),
      collectionName: suggestion.collection?.name ?? "",
      collectionDescription: suggestion.collection?.description ?? "",
    };
  });
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
