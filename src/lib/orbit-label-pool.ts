import "server-only";

import { buildOrbitPromptPayload } from "@/lib/orbit-grok-prompt";
import {
  GENERIC_COLLECTION_NAMES,
  GENERIC_TAG_NAMES,
  isUrlLikeLabel,
  normalizeKey,
  normalizeSuggestedCollectionName,
  normalizeSuggestedTagName,
} from "@/lib/orbit-grok-normalize";
import type {
  OrbitAuthorPriorHint,
  OrbitBookmarkForScan,
  OrbitCollectionContext,
  OrbitTagContext,
} from "@/lib/orbit-grok-schemas";
import type { OrbitLearningHint, OrbitNeighborHint } from "@/lib/orbit-signal-extraction";
import type { OrbitLabelPool, OrbitLabelPoolItem } from "@/lib/orbit-jev-assign";

function addUnique(
  target: Map<string, OrbitLabelPoolItem>,
  item: OrbitLabelPoolItem
) {
  const name = item.name.trim();
  const key = normalizeKey(name);
  if (!name || !key || target.has(key)) return;
  target.set(key, { ...item, name });
}

export function buildSeedOrbitLabelPool(args: {
  bookmarks: OrbitBookmarkForScan[];
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
  authorPriorHints?: OrbitAuthorPriorHint[];
  learningHints?: OrbitLearningHint[];
  neighborHints?: Array<{ bookmarkId: string; hint: OrbitNeighborHint }>;
}): OrbitLabelPool {
  const payload = buildOrbitPromptPayload(args);
  const tags = new Map<string, OrbitLabelPoolItem>();
  const collections = new Map<string, OrbitLabelPoolItem>();

  for (const tag of payload.existingTags) {
    const name = normalizeSuggestedTagName(tag.name);
    if (!name || GENERIC_TAG_NAMES.has(normalizeKey(name)) || isUrlLikeLabel(name)) {
      continue;
    }
    addUnique(tags, { name, existing: true });
  }

  for (const collection of payload.existingCollections) {
    const name = normalizeSuggestedCollectionName(collection.name);
    if (
      !name ||
      GENERIC_COLLECTION_NAMES.has(normalizeKey(name)) ||
      isUrlLikeLabel(name)
    ) {
      continue;
    }
    addUnique(collections, {
      name,
      existing: true,
      description: collection.description,
    });
  }

  const existingTagKeys = new Set(
    args.existingTags.map((tag) => normalizeKey(tag.name))
  );
  const extraTagNames = [
    ...(args.authorPriorHints ?? []).flatMap((hint) => hint.tags),
    ...(args.learningHints ?? []).flatMap((hint) => hint.matchingTags),
    ...(args.neighborHints ?? []).flatMap((entry) => entry.hint.tags),
    ...payload.bookmarks.flatMap(
      (bookmark) => bookmark.signals.existingVocabularyMatches.tags
    ),
  ];
  for (const raw of extraTagNames) {
    const name = normalizeSuggestedTagName(raw);
    if (!name || GENERIC_TAG_NAMES.has(normalizeKey(name)) || isUrlLikeLabel(name)) {
      continue;
    }
    addUnique(tags, { name, existing: existingTagKeys.has(normalizeKey(name)) });
  }

  const existingCollectionKeys = new Set(
    args.existingCollections.map((collection) => normalizeKey(collection.name))
  );
  const extraCollectionNames = [
    ...(args.authorPriorHints ?? []).flatMap((hint) => hint.collections),
    ...(args.learningHints ?? []).flatMap((hint) => hint.matchingCollections),
    ...(args.neighborHints ?? []).flatMap((entry) => entry.hint.collections),
    ...payload.bookmarks.flatMap(
      (bookmark) => bookmark.signals.existingVocabularyMatches.collections
    ),
  ];
  for (const raw of extraCollectionNames) {
    const name = normalizeSuggestedCollectionName(raw);
    if (
      !name ||
      GENERIC_COLLECTION_NAMES.has(normalizeKey(name)) ||
      isUrlLikeLabel(name)
    ) {
      continue;
    }
    addUnique(collections, {
      name,
      existing: existingCollectionKeys.has(normalizeKey(name)),
    });
  }

  return { tags: [...tags.values()], collections: [...collections.values()] };
}

export function labelPoolFromAppliedNames(args: {
  tags: string[];
  collections: Array<{ name: string; description?: string | null }>;
}): OrbitLabelPool {
  const tags = new Map<string, OrbitLabelPoolItem>();
  const collections = new Map<string, OrbitLabelPoolItem>();
  for (const raw of args.tags) {
    const name = normalizeSuggestedTagName(raw);
    if (!name || GENERIC_TAG_NAMES.has(normalizeKey(name)) || isUrlLikeLabel(name)) {
      continue;
    }
    addUnique(tags, { name, existing: true });
  }
  for (const raw of args.collections) {
    const name = normalizeSuggestedCollectionName(raw.name);
    if (
      !name ||
      GENERIC_COLLECTION_NAMES.has(normalizeKey(name)) ||
      isUrlLikeLabel(name)
    ) {
      continue;
    }
    addUnique(collections, {
      name,
      existing: true,
      description: raw.description,
    });
  }
  return { tags: [...tags.values()], collections: [...collections.values()] };
}

export function mergeOrbitLabelPool(
  seed: OrbitLabelPool,
  extra: OrbitLabelPool,
  options?: {
    /**
     * When true (default), merged names are marked as Grok proposals
     * (existing: false). Pass false when merging labels that already exist —
     * harvested batch labels or warm applied names — so shortlisting does not
     * cap them under the proposed-name budget.
     */
    asProposed?: boolean;
  }
): OrbitLabelPool {
  const asProposed = options?.asProposed ?? true;
  const tags = new Map<string, OrbitLabelPoolItem>();
  const collections = new Map<string, OrbitLabelPoolItem>();
  for (const tag of seed.tags) addUnique(tags, tag);
  for (const collection of seed.collections) addUnique(collections, collection);
  for (const tag of extra.tags) {
    addUnique(tags, asProposed ? { ...tag, existing: false } : tag);
  }
  for (const collection of extra.collections) {
    addUnique(
      collections,
      asProposed ? { ...collection, existing: false } : collection
    );
  }
  return { tags: [...tags.values()], collections: [...collections.values()] };
}
