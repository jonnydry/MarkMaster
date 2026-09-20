import "server-only";

import { normalizeKey } from "@/lib/orbit-grok-normalize";
import type { OrbitDecisionEventAction, OrbitDecisionEventPayload } from "@/types";

import type { OrbitJevAssignment, OrbitLabelPool } from "@/lib/orbit-jev-assign";

export type OrbitJevEvalCase = {
  bookmarkId: string;
  action: OrbitDecisionEventAction;
  originalTags: string[];
  originalCollection: string | null;
  reviewedTags: string[];
  reviewedCollection: string | null;
  pool: OrbitLabelPool;
};

export type OrbitJevEvalScore = {
  bookmarkId: string;
  action: OrbitDecisionEventAction;
  expectedTags: string[];
  assignedTags: string[];
  tagHits: number;
  tagFalsePositives: number;
  collectionMatch: boolean;
  shouldAbstain: boolean;
  abstained: boolean;
  useful: boolean;
};

function uniqueKeys(names: string[]) {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const name of names) {
    const key = normalizeKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    values.push(name);
  }
  return values;
}

function labelsFromSuggestion(suggestion: {
  tags?: Array<{ name?: string; reuseExisting?: boolean }>;
  collection?: { name?: string; reuseExisting?: boolean } | null;
}) {
  const tags = uniqueKeys(
    (suggestion.tags ?? []).flatMap((tag) =>
      typeof tag.name === "string" && tag.name.trim() ? [tag.name] : []
    )
  );
  const collection =
    suggestion.collection && typeof suggestion.collection.name === "string"
      ? suggestion.collection.name.trim() || null
      : null;
  const existingTags = (suggestion.tags ?? []).flatMap((tag) =>
    tag.reuseExisting && typeof tag.name === "string" && tag.name.trim()
      ? [{ name: tag.name, existing: true as const }]
      : []
  );
  const existingCollections =
    suggestion.collection?.reuseExisting &&
    typeof suggestion.collection.name === "string" &&
    suggestion.collection.name.trim()
      ? [
          {
            name: suggestion.collection.name,
            existing: true as const,
          },
        ]
      : [];

  return { tags, collection, existingTags, existingCollections };
}

function sameLabel(a: string | null, b: string | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return normalizeKey(a) === normalizeKey(b);
}

function expectedLabels(evalCase: OrbitJevEvalCase) {
  if (evalCase.action === "accepted" || evalCase.action === "edited") {
    return {
      tags: evalCase.reviewedTags.length > 0 ? evalCase.reviewedTags : evalCase.originalTags,
      collection:
        evalCase.reviewedCollection ?? evalCase.originalCollection,
      shouldAbstain: false,
    };
  }

  return {
    tags: [] as string[],
    collection: null,
    shouldAbstain: true,
  };
}

export function buildOrbitJevEvalCaseFromEvent(
  event: OrbitDecisionEventPayload
): OrbitJevEvalCase {
  const original = labelsFromSuggestion(event.originalSuggestion ?? {});
  const reviewed = labelsFromSuggestion(event.reviewedSuggestion ?? {});

  return {
    bookmarkId: event.bookmarkId,
    action: event.action,
    originalTags: original.tags,
    originalCollection: original.collection,
    reviewedTags: reviewed.tags,
    reviewedCollection: reviewed.collection,
    pool: {
      tags: uniqueKeys([
        ...original.existingTags.map((tag) => tag.name),
        ...reviewed.existingTags.map((tag) => tag.name),
        ...original.tags,
        ...reviewed.tags,
      ]).map((name) => ({ name, existing: true })),
      collections: uniqueKeys([
        ...original.existingCollections.map((collection) => collection.name),
        ...reviewed.existingCollections.map((collection) => collection.name),
        ...(original.collection ? [original.collection] : []),
        ...(reviewed.collection ? [reviewed.collection] : []),
      ]).map((name) => ({ name, existing: true })),
    },
  };
}

export function scoreOrbitJevEvalCase(
  evalCase: OrbitJevEvalCase,
  assignment: Pick<
    OrbitJevAssignment,
    "tags" | "collection" | "abstain" | "needsNewLabel"
  >
): OrbitJevEvalScore {
  const expected = expectedLabels(evalCase);
  const assignedTags = uniqueKeys(assignment.tags.map((tag) => tag.name));
  const assignedKeys = new Set(assignedTags.map((name) => normalizeKey(name)));
  const expectedKeys = new Set(expected.tags.map((name) => normalizeKey(name)));

  const tagHits = expected.tags.filter((name) =>
    assignedKeys.has(normalizeKey(name))
  ).length;
  const tagFalsePositives = assignedTags.filter(
    (name) => !expectedKeys.has(normalizeKey(name))
  ).length;
  const collectionMatch = expected.collection
    ? sameLabel(expected.collection, assignment.collection?.name ?? null)
    : false;
  const abstained = assignment.abstain || assignment.needsNewLabel;

  const useful = expected.shouldAbstain
    ? abstained && assignedTags.length === 0 && !assignment.collection
    : tagHits > 0 || collectionMatch;

  return {
    bookmarkId: evalCase.bookmarkId,
    action: evalCase.action,
    expectedTags: expected.tags,
    assignedTags,
    tagHits,
    tagFalsePositives,
    collectionMatch,
    shouldAbstain: expected.shouldAbstain,
    abstained,
    useful,
  };
}

export function summarizeOrbitJevEval(scores: OrbitJevEvalScore[]) {
  const useful = scores.filter((score) => score.useful).length;
  const abstainCorrect = scores.filter(
    (score) => score.shouldAbstain && score.useful
  ).length;
  const positive = scores.filter((score) => !score.shouldAbstain);
  const tagHits = positive.reduce((total, score) => total + score.tagHits, 0);
  const expectedTags = positive.reduce(
    (total, score) => total + score.expectedTags.length,
    0
  );
  const falsePositives = scores.reduce(
    (total, score) => total + score.tagFalsePositives,
    0
  );

  return {
    caseCount: scores.length,
    usefulRate: scores.length === 0 ? 0 : useful / scores.length,
    abstainCorrect,
    tagRecall: expectedTags === 0 ? 1 : tagHits / expectedTags,
    falsePositiveCount: falsePositives,
  };
}
