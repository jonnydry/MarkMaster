import "server-only";

import type {
  OrbitAuthorPriorHint,
  OrbitBookmarkForScan,
  OrbitCollectionContext,
  OrbitTagContext,
} from "@/lib/orbit-grok";
import { collectOrbitBookmarkHaystackTexts } from "@/lib/orbit-primary-text";
import {
  getOrbitScanBookmarkTokens,
  labelToTokens,
  tokenOverlapScore,
} from "@/lib/orbit-scan-tokens";

const MAX_PROMPT_EXISTING_TAGS = 80;
const MAX_PROMPT_EXISTING_COLLECTIONS = 40;

function normalizeKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function labelMatchesBatchHaystack(label: string, haystack: string) {
  const key = normalizeKey(label);
  if (!key) return false;
  if (key.length <= 3) {
    return new RegExp(
      `(^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`,
      "i"
    ).test(haystack);
  }
  return haystack.includes(key);
}

function buildBatchHaystack(bookmarks: OrbitBookmarkForScan[]) {
  return bookmarks
    .flatMap((bookmark) => [
      ...collectOrbitBookmarkHaystackTexts(bookmark),
      ...(Array.isArray(bookmark.urls)
        ? bookmark.urls.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const record = item as Record<string, unknown>;
            return [
              typeof record.title === "string" ? record.title : null,
              typeof record.description === "string" ? record.description : null,
            ];
          })
        : []),
      ...(bookmark.xFolderHints ?? []).map((folder) => folder.name),
    ])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function authorPriorLabels(
  authorPriorHints: OrbitAuthorPriorHint[] | undefined,
  bookmarks: OrbitBookmarkForScan[]
) {
  const usernames = new Set(
    bookmarks.map((bookmark) => normalizeKey(bookmark.authorUsername))
  );
  const tags = new Set<string>();
  const collections = new Set<string>();

  for (const hint of authorPriorHints ?? []) {
    if (!usernames.has(normalizeKey(hint.authorUsername))) continue;
    for (const tag of hint.tags) tags.add(tag);
    for (const collection of hint.collections) collections.add(collection);
  }

  return { tags, collections };
}

function scoreTag(
  tag: OrbitTagContext,
  args: {
    batchHaystack: string;
    authorPriorTags: Set<string>;
    bookmarkTokenSets: Set<string>[];
  }
) {
  let score = Math.log1p(tag.bookmarkCount ?? 0);

  if (labelMatchesBatchHaystack(tag.name, args.batchHaystack)) {
    score += 10;
  }
  if (args.authorPriorTags.has(tag.name)) {
    score += 8;
  }

  const labelTokens = labelToTokens(tag.name);
  for (const bookmarkTokens of args.bookmarkTokenSets) {
    if (tokenOverlapScore(labelTokens, bookmarkTokens) > 0) {
      score += 5;
      break;
    }
  }

  return score;
}

function scoreCollection(
  collection: OrbitCollectionContext,
  args: {
    batchHaystack: string;
    authorPriorCollections: Set<string>;
    bookmarkTokenSets: Set<string>[];
  }
) {
  let score = Math.log1p(collection.bookmarkCount ?? 0);

  if (labelMatchesBatchHaystack(collection.name, args.batchHaystack)) {
    score += 10;
  }
  if (args.authorPriorCollections.has(collection.name)) {
    score += 8;
  }

  const labelTokens = labelToTokens(collection.name);
  if (collection.description) {
    for (const token of labelToTokens(collection.description)) {
      labelTokens.add(token);
    }
  }

  for (const bookmarkTokens of args.bookmarkTokenSets) {
    if (tokenOverlapScore(labelTokens, bookmarkTokens) > 0) {
      score += 5;
      break;
    }
  }

  return score;
}

export function rankTagsForOrbitPrompt(
  tags: OrbitTagContext[],
  bookmarks: OrbitBookmarkForScan[],
  authorPriorHints?: OrbitAuthorPriorHint[],
  maxCount = MAX_PROMPT_EXISTING_TAGS
): OrbitTagContext[] {
  const batchHaystack = buildBatchHaystack(bookmarks);
  const bookmarkTokenSets = bookmarks.map((bookmark) =>
    getOrbitScanBookmarkTokens(bookmark)
  );
  const { tags: authorPriorTags } = authorPriorLabels(authorPriorHints, bookmarks);

  return [...tags]
    .map((tag) => ({
      tag,
      score: scoreTag(tag, { batchHaystack, authorPriorTags, bookmarkTokenSets }),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.tag.bookmarkCount ?? 0) - (a.tag.bookmarkCount ?? 0) ||
        a.tag.name.localeCompare(b.tag.name)
    )
    .slice(0, maxCount)
    .map((entry) => entry.tag);
}

export function rankCollectionsForOrbitPrompt(
  collections: OrbitCollectionContext[],
  bookmarks: OrbitBookmarkForScan[],
  authorPriorHints?: OrbitAuthorPriorHint[],
  maxCount = MAX_PROMPT_EXISTING_COLLECTIONS
): OrbitCollectionContext[] {
  const batchHaystack = buildBatchHaystack(bookmarks);
  const bookmarkTokenSets = bookmarks.map((bookmark) =>
    getOrbitScanBookmarkTokens(bookmark)
  );
  const { collections: authorPriorCollections } = authorPriorLabels(
    authorPriorHints,
    bookmarks
  );

  return [...collections]
    .map((collection) => ({
      collection,
      score: scoreCollection(collection, {
        batchHaystack,
        authorPriorCollections,
        bookmarkTokenSets,
      }),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.collection.bookmarkCount ?? 0) - (a.collection.bookmarkCount ?? 0) ||
        a.collection.name.localeCompare(b.collection.name)
    )
    .slice(0, maxCount)
    .map((entry) => entry.collection);
}