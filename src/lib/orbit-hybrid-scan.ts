import "server-only";

import { randomUUID } from "node:crypto";

import {
  ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN,
  ORBIT_SCAN_BATCH_PROFILES,
} from "@/lib/orbit-config";
import {
  assignOrbitBookmarksWithJev,
  batchVocabularyFromPool,
  harvestOrbitAcceptedLabels,
  jevAssignmentsToRawPlan,
  leftoverNotesFromAssignments,
  replaceOrbitJevAssignments,
  type OrbitBatchVocabulary,
  type OrbitHybridLeftoverNote,
  type OrbitJevAssignment,
  type OrbitLabelPool,
} from "@/lib/orbit-jev-assign";
import { normalizeKey } from "@/lib/orbit-grok-normalize";
import {
  buildSeedOrbitLabelPool,
  mergeOrbitLabelPool,
} from "@/lib/orbit-label-pool";
import { logWarn } from "@/lib/logger";
import {
  buildOrbitCollectionRollups,
  buildOrbitScanSummary,
  buildOrbitTagRollups,
  normalizeOrbitScanPlan,
} from "@/lib/orbit-grok-parse";
import {
  getOrbitXaiRuntimeStatus,
  type OrbitAuthorPriorHint,
  type OrbitBookmarkForScan,
  type OrbitCollectionContext,
  type OrbitScanPlanFromXai,
  type OrbitTagContext,
} from "@/lib/orbit-grok-schemas";
import type { OrbitLearningHint, OrbitNeighborHint } from "@/lib/orbit-signal-extraction";
import { getTypeSafeModel } from "@/lib/typesafe";
import type {
  OrbitHybridScanMetrics,
  OrbitScanBatchMetadata,
  OrbitScanResponsePayload,
} from "@/types";

export function selectOrbitJevLeftovers(assignments: OrbitJevAssignment[]) {
  return assignments.filter(
    (assignment) => assignment.needsNewLabel || assignment.abstain
  );
}

export function chunkItems<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function stripNormalizedSuggestion(
  suggestion: OrbitScanPlanFromXai["suggestions"][number]
): OrbitScanPlanFromXai["suggestions"][number] {
  return {
    bookmarkId: suggestion.bookmarkId,
    confidence: suggestion.confidence,
    reasoning: suggestion.reasoning,
    tags: suggestion.tags.map((tag) => ({
      name: tag.name,
      color: tag.color,
      reason: tag.reason,
    })),
    collection: suggestion.collection
      ? {
          name: suggestion.collection.name,
          description: suggestion.collection.description,
          reason: suggestion.collection.reason,
        }
      : null,
  };
}

export function mergeLeftoverSuggestion(
  jev: OrbitScanPlanFromXai["suggestions"][number],
  grok: OrbitScanPlanFromXai["suggestions"][number]
): OrbitScanPlanFromXai["suggestions"][number] {
  const tags = [...jev.tags];
  const seen = new Set(tags.map((tag) => normalizeKey(tag.name)));
  const added: string[] = [];
  for (const tag of grok.tags) {
    const key = normalizeKey(tag.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    added.push(tag.name);
  }

  const rank = { high: 2, medium: 1, low: 0 };
  const confidence =
    rank[grok.confidence] > rank[jev.confidence] ? grok.confidence : jev.confidence;
  const usedGrokCollection = !jev.collection && Boolean(grok.collection);
  const reasoning = added.length
    ? `${jev.reasoning} Grok named ${added.join(", ")}.`
    : usedGrokCollection
      ? grok.reasoning
      : jev.reasoning;

  return {
    bookmarkId: jev.bookmarkId,
    confidence,
    reasoning: reasoning.slice(0, 180),
    tags: tags.slice(0, 3),
    collection: jev.collection ?? grok.collection,
  };
}

export function mergeOrbitScanPlans(
  primary: OrbitScanPlanFromXai,
  overlay: OrbitScanPlanFromXai,
  overlayBookmarkIds: Set<string>
): OrbitScanPlanFromXai {
  const overlayById = new Map(
    overlay.suggestions.map((suggestion) => [suggestion.bookmarkId, suggestion])
  );

  return {
    overview: primary.overview,
    suggestions: primary.suggestions.map((suggestion) => {
      if (!overlayBookmarkIds.has(suggestion.bookmarkId)) {
        return suggestion;
      }
      const escalated = overlayById.get(suggestion.bookmarkId);
      return escalated
        ? mergeLeftoverSuggestion(suggestion, stripNormalizedSuggestion(escalated))
        : suggestion;
    }),
  };
}

export async function refineOrbitJevLeftovers(args: {
  bookmarks: OrbitBookmarkForScan[];
  assignments: OrbitJevAssignment[];
  pool: OrbitLabelPool;
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
  authorPriorHints?: OrbitAuthorPriorHint[];
  learningHints?: OrbitLearningHint[];
  neighborHints?: Array<{ bookmarkId: string; hint: OrbitNeighborHint }>;
  proposeLeftoverVocab?: (
    bookmarks: OrbitBookmarkForScan[],
    notes: OrbitHybridLeftoverNote[]
  ) => Promise<OrbitLabelPool>;
}): Promise<{ assignments: OrbitJevAssignment[]; pool: OrbitLabelPool }> {
  const harvest = harvestOrbitAcceptedLabels(args.assignments);
  let pool = mergeOrbitLabelPool(args.pool, harvest, { asProposed: false });
  const leftovers = selectOrbitJevLeftovers(args.assignments);
  if (leftovers.length === 0) {
    return { assignments: args.assignments, pool };
  }

  const leftoverIds = new Set(leftovers.map((assignment) => assignment.bookmarkId));
  const leftoverBookmarks = args.bookmarks.filter((bookmark) =>
    leftoverIds.has(bookmark.id)
  );
  const notes = leftoverNotesFromAssignments(leftovers);

  if (args.proposeLeftoverVocab) {
    try {
      const proposed = await args.proposeLeftoverVocab(leftoverBookmarks, notes);
      pool = mergeOrbitLabelPool(pool, proposed);
    } catch (error) {
      logWarn(
        "OrbitHybrid",
        "Leftover vocabulary proposal failed; retrying leftovers against accepted batch labels.",
        error instanceof Error ? error.message : error
      );
    }
  }

  // The batch vocabulary is only the labels Jev accepted this batch — not the
  // whole pool. Preferring the whole pool would flood every leftover shortlist
  // with all existing tags instead of the ~12-question budget.
  const refined = await assignOrbitBookmarksWithJev({
    bookmarks: leftoverBookmarks,
    existingTags: args.existingTags,
    existingCollections: args.existingCollections,
    pool,
    authorPriorHints: args.authorPriorHints,
    learningHints: args.learningHints,
    neighborHints: args.neighborHints,
    batchVocabulary: batchVocabularyFromPool(harvest),
  });

  return {
    assignments: replaceOrbitJevAssignments(args.assignments, refined),
    pool,
  };
}

export function computeOrbitHybridScanMetrics(args: {
  firstPassLeftovers: number;
  refinedLeftovers: number;
  escalatedToGrok: number;
}): OrbitHybridScanMetrics {
  return {
    firstPassLeftovers: args.firstPassLeftovers,
    refinedLeftovers: args.refinedLeftovers,
    recoveredOnRefine: Math.max(0, args.firstPassLeftovers - args.refinedLeftovers),
    escalatedToGrok: args.escalatedToGrok,
  };
}

function defaultBatchMetadata(
  requestedCount: number,
  batch?: OrbitScanBatchMetadata
): OrbitScanBatchMetadata {
  return (
    batch ?? {
      mode: "balanced",
      profile:
        requestedCount <= ORBIT_SCAN_BATCH_PROFILES.quick.size
          ? "quick"
          : requestedCount <= ORBIT_SCAN_BATCH_PROFILES.balanced.size
            ? "balanced"
            : requestedCount <= ORBIT_SCAN_BATCH_PROFILES.deep.size
              ? "deep"
              : "sweep",
      requestedCount,
      candidatePoolCount: requestedCount,
      sharedSignalCount: 0,
      sourceUnknownCount: 0,
      sourceUnknownRate: 0,
      selectedSourceUnknownCount: 0,
      selectedSourceUnknownRate: 0,
      usefulSignalCount: 0,
      selectionReason: "Scanned the provided bookmark IDs.",
    }
  );
}

/**
 * First Jev pass plus leftover refine. Callers own the label pool:
 * Scan passes the seed pool only; Classify may pass a warm-merged pool and
 * first-pass batch vocabulary. Grok escalation and safe auto-apply stay outside.
 */
export async function assignAndRefineOrbitJev(args: {
  bookmarks: OrbitBookmarkForScan[];
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
  pool: OrbitLabelPool;
  authorPriorHints?: OrbitAuthorPriorHint[];
  learningHints?: OrbitLearningHint[];
  neighborHints?: Array<{ bookmarkId: string; hint: OrbitNeighborHint }>;
  /** Classify warm-pool names for the first pass. Omit on Scan. */
  firstPassBatchVocabulary?: OrbitBatchVocabulary;
  proposeLeftoverVocab?: (
    bookmarks: OrbitBookmarkForScan[],
    notes: OrbitHybridLeftoverNote[]
  ) => Promise<OrbitLabelPool>;
}): Promise<{ assignments: OrbitJevAssignment[]; firstPassLeftovers: number }> {
  const firstPass = await assignOrbitBookmarksWithJev({
    bookmarks: args.bookmarks,
    existingTags: args.existingTags,
    existingCollections: args.existingCollections,
    pool: args.pool,
    authorPriorHints: args.authorPriorHints,
    learningHints: args.learningHints,
    neighborHints: args.neighborHints,
    batchVocabulary: args.firstPassBatchVocabulary,
  });
  const firstPassLeftovers = selectOrbitJevLeftovers(firstPass).length;
  const refined = await refineOrbitJevLeftovers({
    bookmarks: args.bookmarks,
    assignments: firstPass,
    pool: args.pool,
    existingTags: args.existingTags,
    existingCollections: args.existingCollections,
    authorPriorHints: args.authorPriorHints,
    learningHints: args.learningHints,
    neighborHints: args.neighborHints,
    proposeLeftoverVocab: args.proposeLeftoverVocab,
  });
  return { assignments: refined.assignments, firstPassLeftovers };
}

export async function runHybridOrbitScan(args: {
  bookmarks: OrbitBookmarkForScan[];
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
  authorPriorHints?: OrbitAuthorPriorHint[];
  learningHints?: OrbitLearningHint[];
  neighborHints?: Array<{ bookmarkId: string; hint: OrbitNeighborHint }>;
  batch?: OrbitScanBatchMetadata;
  escalateLeftovers?: (
    bookmarks: OrbitBookmarkForScan[],
    notes: OrbitHybridLeftoverNote[]
  ) => Promise<OrbitScanPlanFromXai>;
}): Promise<OrbitScanResponsePayload> {
  const seed = buildSeedOrbitLabelPool(args);
  let grokUsed = false;
  const { assignments, firstPassLeftovers } = await assignAndRefineOrbitJev({
    bookmarks: args.bookmarks,
    existingTags: args.existingTags,
    existingCollections: args.existingCollections,
    pool: seed,
    authorPriorHints: args.authorPriorHints,
    learningHints: args.learningHints,
    neighborHints: args.neighborHints,
  });
  let rawPlan = jevAssignmentsToRawPlan(assignments);

  const leftovers = selectOrbitJevLeftovers(assignments);
  let escalatedToGrok = 0;
  if (leftovers.length > 0 && args.escalateLeftovers) {
    const escalate = args.escalateLeftovers;
    const leftoverIds = new Set(leftovers.map((assignment) => assignment.bookmarkId));
    const leftoverBookmarks = args.bookmarks.filter((bookmark) =>
      leftoverIds.has(bookmark.id)
    );
    // Chunks run in parallel; a failed chunk keeps its Jev abstentions and is
    // excluded from the escalated count so the metrics stay honest.
    const settled = await Promise.allSettled(
      chunkItems(leftoverBookmarks, ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN).map(
        async (chunk) => {
          const chunkIds = new Set(chunk.map((bookmark) => bookmark.id));
          const notes = leftoverNotesFromAssignments(
            leftovers.filter((assignment) => chunkIds.has(assignment.bookmarkId))
          );
          return { chunkIds, plan: await escalate(chunk, notes) };
        }
      )
    );
    for (const result of settled) {
      if (result.status === "fulfilled") {
        rawPlan = mergeOrbitScanPlans(rawPlan, result.value.plan, result.value.chunkIds);
        escalatedToGrok += result.value.chunkIds.size;
        grokUsed = true;
      } else {
        logWarn(
          "OrbitHybrid",
          "Grok leftover escalation failed for a chunk; keeping Jev abstentions for review.",
          result.reason instanceof Error ? result.reason.message : result.reason
        );
      }
    }
    if (escalatedToGrok > 0) {
      rawPlan = {
        ...rawPlan,
        overview: {
          ...rawPlan.overview,
          summary: `${rawPlan.overview.summary} Suggested tags for ${escalatedToGrok} bookmark${
            escalatedToGrok === 1 ? "" : "s"
          } with no existing match.`,
        },
      };
    }
  }

  const plan = normalizeOrbitScanPlan(rawPlan, {
    bookmarkIds: args.bookmarks.map((bookmark) => bookmark.id),
    existingTags: args.existingTags,
    existingCollections: args.existingCollections,
  });

  const runtime = getOrbitXaiRuntimeStatus();
  const jevModel = getTypeSafeModel();
  const model = grokUsed ? `${jevModel}+${runtime.model}` : jevModel;

  return {
    scanRunId: randomUUID(),
    model,
    scannedAt: new Date().toISOString(),
    privacy: {
      storeDisabled: true,
      zeroDataRetention: null,
    },
    batch: {
      ...defaultBatchMetadata(args.bookmarks.length, args.batch),
      hybrid: computeOrbitHybridScanMetrics({
        firstPassLeftovers,
        refinedLeftovers: leftovers.length,
        escalatedToGrok,
      }),
    },
    plan,
    summary: buildOrbitScanSummary(plan),
    tagRollups: buildOrbitTagRollups(plan),
    collectionRollups: buildOrbitCollectionRollups(plan),
  };
}
