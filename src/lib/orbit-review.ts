import type {
  CollectionWithCount,
  OrbitCollectionSuggestion,
  OrbitScanPlan,
  OrbitTagSuggestion,
  TagWithCount,
} from "@/types";

const DEFAULT_REVIEW_TAG_COLORS = [
  "#1d9bf0",
  "#22c55e",
  "#a855f7",
  "#f59e0b",
  "#ef4444",
] as const;

export interface OrbitReviewSuggestionDraft {
  bookmarkId: string;
  included: boolean;
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

function splitTagNames(value: string): string[] {
  const deduped = new Map<string, string>();

  for (const rawName of value.split(/[,\n]/)) {
    const name = truncate(rawName, 50);
    const key = normalizeKey(name);
    if (!key || deduped.has(key)) continue;
    deduped.set(key, name);
  }

  return Array.from(deduped.values()).slice(0, 3);
}

export function createOrbitReviewDraft(
  plan: OrbitScanPlan
): OrbitReviewSuggestionDraft[] {
  return plan.suggestions.map((suggestion) => ({
    bookmarkId: suggestion.bookmarkId,
    included: true,
    tagNames: suggestion.tags.map((tag) => tag.name).join(", "),
    collectionName: suggestion.collection?.name ?? "",
    collectionDescription: suggestion.collection?.description ?? "",
  }));
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
    if (!draft.included) return [];

    const sourceSuggestion = sourceSuggestionById.get(draft.bookmarkId);
    if (!sourceSuggestion) return [];

    const sourceTagByKey = new Map(
      sourceSuggestion.tags.map((tag) => [normalizeKey(tag.name), tag])
    );
    const tags: OrbitTagSuggestion[] = splitTagNames(draft.tagNames).map(
      (tagName, index) => {
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
      }
    );

    const collectionName = truncate(draft.collectionName, 100);
    let collection: OrbitCollectionSuggestion | null = null;

    if (collectionName) {
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
