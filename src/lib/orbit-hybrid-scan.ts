import "server-only";

import { randomUUID } from "node:crypto";

import type { Usage } from "@typesafe-ai/sdk";

import {
  ORBIT_GROK_ESCALATION_TIMEOUT_MS,
  ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN,
  ORBIT_GROK_MIN_CALL_MS,
  ORBIT_GROK_VOCAB_TIMEOUT_MS,
  ORBIT_JEV_MAX_COLLECTION_SHORTLIST,
  ORBIT_JEV_MAX_TAG_SHORTLIST,
  ORBIT_MAX_TAGS_PER_BOOKMARK,
  ORBIT_SCAN_BATCH_PROFILES,
  ORBIT_SCAN_JEV_PASS_RESERVE_MS,
} from "@/lib/orbit-config";
import {
  addNarrowedLabels,
  assignOrbitBookmarksWithJev,
  batchVocabularyFromPool,
  harvestOrbitAcceptedLabels,
  jevAssignmentsToRawPlan,
  leftoverNotesFromAssignments,
  orbitBookmarkMentionsAnyLabel,
  replaceOrbitJevAssignments,
  verifyOrbitSuggestionsWithJev,
  type OrbitBatchVocabulary,
  type OrbitHybridLeftoverNote,
  type OrbitJevAssignment,
  type OrbitLabelPool,
} from "@/lib/orbit-jev-assign";
import type { OrbitGrokUsage } from "@/lib/orbit-grok-parse";
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
  OrbitScanModelUsage,
  OrbitScanProgressEvent,
  OrbitScanResponsePayload,
} from "@/types";

/** Receives live scan progress; streamed to the Orbit page when it asked for it. */
export type OrbitScanProgressSink = (event: OrbitScanProgressEvent) => void;

/** Per-call limits handed to a Grok call made during a hybrid scan. */
export type OrbitGrokCallOptions = {
  timeoutMs: number;
  onUsage?: (usage: OrbitGrokUsage) => void;
};

export type OrbitProposeLeftoverVocab = (
  bookmarks: OrbitBookmarkForScan[],
  notes: OrbitHybridLeftoverNote[],
  options: OrbitGrokCallOptions
) => Promise<OrbitLabelPool>;

export type OrbitEscalateLeftovers = (
  bookmarks: OrbitBookmarkForScan[],
  notes: OrbitHybridLeftoverNote[],
  options: OrbitGrokCallOptions
) => Promise<OrbitScanPlanFromXai>;

/** Counts model calls and tokens across one scan. */
export function createOrbitScanUsageTracker() {
  const usage: OrbitScanModelUsage = {
    jevCalls: 0,
    jevInputTokens: 0,
    jevOutputTokens: 0,
    grokCalls: 0,
    grokInputTokens: 0,
    grokOutputTokens: 0,
  };
  return {
    usage,
    onJevUsage: (call: Usage) => {
      usage.jevCalls += 1;
      usage.jevInputTokens += call.input_tokens ?? 0;
      usage.jevOutputTokens += call.output_tokens ?? 0;
    },
    onGrokUsage: (call: OrbitGrokUsage) => {
      usage.grokCalls += 1;
      usage.grokInputTokens += call.inputTokens;
      usage.grokOutputTokens += call.outputTokens;
    },
  };
}

export type OrbitScanUsageTracker = ReturnType<typeof createOrbitScanUsageTracker>;

/**
 * Time a Grok call may take while still leaving `reserveMs` for the Jev pass
 * after it. Null when that leaves less than a useful call: the step is skipped
 * and its bookmarks stay for review instead of the function being killed
 * mid-stream (which would lose the whole result).
 */
export function grokCallBudgetMs(
  deadline: number | undefined,
  capMs: number,
  reserveMs = ORBIT_SCAN_JEV_PASS_RESERVE_MS,
  now = Date.now()
): number | null {
  if (deadline === undefined) return capMs;
  const available = deadline - now - reserveMs;
  if (available < ORBIT_GROK_MIN_CALL_MS) return null;
  return Math.min(capMs, available);
}

/** Aborts Jev calls still running at the scan's deadline. */
function deadlineSignal(deadline: number | undefined) {
  return deadline === undefined
    ? undefined
    : AbortSignal.timeout(Math.max(0, deadline - Date.now()));
}

/** A Jev answer as a row event: matched (with a preview label) or left over. */
function orbitScanRowEvent(
  assignment: OrbitJevAssignment
): OrbitScanProgressEvent {
  const leftover = isOrbitJevLeftover(assignment);
  return {
    type: "row",
    bookmarkId: assignment.bookmarkId,
    state: leftover ? "leftover" : "matched",
    label: leftover
      ? null
      : (assignment.tags[0]?.name ?? assignment.collection?.name ?? null),
  };
}

/** Leftover when Jev placed nothing and wants a new label or abstained. */
function isOrbitJevLeftover(assignment: OrbitJevAssignment) {
  if (assignment.tags.length > 0 || assignment.collection) return false;
  return assignment.needsNewLabel || assignment.abstain;
}

export function selectOrbitJevLeftovers(assignments: OrbitJevAssignment[]) {
  return assignments.filter(isOrbitJevLeftover);
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
      ...(typeof tag.score === "number" ? { score: tag.score } : {}),
      ...(tag.origin ? { origin: tag.origin } : {}),
    })),
    collection: suggestion.collection
      ? {
          name: suggestion.collection.name,
          description: suggestion.collection.description,
          reason: suggestion.collection.reason,
          ...(typeof suggestion.collection.score === "number"
            ? { score: suggestion.collection.score }
            : {}),
          ...(suggestion.collection.origin
            ? { origin: suggestion.collection.origin }
            : {}),
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
    tags: tags.slice(0, ORBIT_MAX_TAGS_PER_BOOKMARK),
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

/**
 * Placed bookmarks worth asking about Grok's new names: coarse fits, plus any
 * whose text names one of the new tags (they share the topic but matched a
 * broader existing tag first).
 */
function selectNarrowingTargets(
  bookmarks: OrbitBookmarkForScan[],
  assignments: OrbitJevAssignment[],
  proposed: OrbitLabelPool,
  skipIds: ReadonlySet<string>
) {
  const proposedNames = proposed.tags.map((tag) => tag.name);
  const placed = new Map(
    assignments
      .filter((assignment) => assignment.tags.length > 0 || assignment.collection)
      .map((assignment) => [assignment.bookmarkId, assignment])
  );
  return bookmarks.filter((bookmark) => {
    if (skipIds.has(bookmark.id)) return false;
    const assignment = placed.get(bookmark.id);
    if (!assignment) return false;
    return (
      assignment.coarseFit ||
      orbitBookmarkMentionsAnyLabel(bookmark, proposedNames)
    );
  });
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
  proposeLeftoverVocab?: OrbitProposeLeftoverVocab;
  onProgress?: OrbitScanProgressSink;
  /** Epoch ms after which no new Grok call starts and Jev calls abort. */
  deadline?: number;
  usage?: OrbitScanUsageTracker;
}): Promise<{
  assignments: OrbitJevAssignment[];
  pool: OrbitLabelPool;
  coarseFits: number;
  namedByGrok: number;
  narrowed: number;
}> {
  const harvest = harvestOrbitAcceptedLabels(args.assignments);
  let pool = mergeOrbitLabelPool(args.pool, harvest, { asProposed: false });
  const leftovers = selectOrbitJevLeftovers(args.assignments);
  const coarse = args.assignments.filter((assignment) => assignment.coarseFit);
  if (leftovers.length === 0 && coarse.length === 0) {
    return { assignments: args.assignments, pool, coarseFits: 0, namedByGrok: 0, narrowed: 0 };
  }

  const leftoverIds = new Set(leftovers.map((assignment) => assignment.bookmarkId));
  const gaps = [...leftovers, ...coarse];
  const gapIds = new Set(gaps.map((assignment) => assignment.bookmarkId));
  let proposed: OrbitLabelPool = { tags: [], collections: [] };
  let namedByGrok = 0;

  const vocabBudget = args.proposeLeftoverVocab
    ? grokCallBudgetMs(args.deadline, ORBIT_GROK_VOCAB_TIMEOUT_MS)
    : null;
  if (args.proposeLeftoverVocab && vocabBudget !== null) {
    // Coarse fits already show as matched; only leftovers wait on Grok.
    if (leftoverIds.size > 0) {
      args.onProgress?.({
        type: "phase",
        phase: "name",
        bookmarkIds: [...leftoverIds],
      });
    }
    try {
      proposed = await args.proposeLeftoverVocab(
        args.bookmarks.filter((bookmark) => gapIds.has(bookmark.id)),
        leftoverNotesFromAssignments(gaps),
        { timeoutMs: vocabBudget, onUsage: args.usage?.onGrokUsage }
      );
      pool = mergeOrbitLabelPool(pool, proposed);
      namedByGrok = gapIds.size;
    } catch (error) {
      logWarn(
        "OrbitHybrid",
        "Leftover vocabulary proposal failed; retrying leftovers against accepted batch labels.",
        error instanceof Error ? error.message : error
      );
    }
  } else if (args.proposeLeftoverVocab) {
    logWarn("OrbitHybrid", "Skipped Grok naming: the scan is short on time.");
  }

  let assignments = args.assignments;
  if (leftovers.length > 0) {
    args.onProgress?.({
      type: "phase",
      phase: "refine",
      bookmarkIds: [...leftoverIds],
    });

    // Prefer labels Jev already accepted, plus the names Grok just proposed.
    // The shortlist grows by those new names so they are actually asked about.
    const harvestVocabulary = batchVocabularyFromPool(harvest);
    const refined = await assignOrbitBookmarksWithJev({
      bookmarks: args.bookmarks.filter((bookmark) => leftoverIds.has(bookmark.id)),
      existingTags: args.existingTags,
      existingCollections: args.existingCollections,
      pool,
      authorPriorHints: args.authorPriorHints,
      learningHints: args.learningHints,
      neighborHints: args.neighborHints,
      maxTagShortlist: ORBIT_JEV_MAX_TAG_SHORTLIST + proposed.tags.length,
      maxCollectionShortlist:
        ORBIT_JEV_MAX_COLLECTION_SHORTLIST + proposed.collections.length,
      batchVocabulary: {
        tags: [...harvestVocabulary.tags, ...proposed.tags.map((tag) => tag.name)],
        collections: [
          ...harvestVocabulary.collections,
          ...proposed.collections.map((collection) => collection.name),
        ],
      },
      onAssigned: args.onProgress
        ? (assignment) => args.onProgress?.(orbitScanRowEvent(assignment))
        : undefined,
      signal: deadlineSignal(args.deadline),
      onUsage: args.usage?.onJevUsage,
    });
    assignments = replaceOrbitJevAssignments(assignments, refined);
  }

  // Grok's new names only reached the leftovers above. Bookmarks already
  // placed under broader tags are asked about them too, as extra tags.
  let narrowed = 0;
  if (proposed.tags.length > 0 || proposed.collections.length > 0) {
    const targets = selectNarrowingTargets(
      args.bookmarks,
      assignments,
      proposed,
      leftoverIds
    );
    if (targets.length > 0) {
      const extra = await assignOrbitBookmarksWithJev({
        bookmarks: targets,
        existingTags: args.existingTags,
        existingCollections: args.existingCollections,
        pool: proposed,
        maxTagShortlist: proposed.tags.length,
        maxCollectionShortlist: proposed.collections.length,
        batchVocabulary: batchVocabularyFromPool(proposed),
        askNewLabelGap: false,
        signal: deadlineSignal(args.deadline),
        onUsage: args.usage?.onJevUsage,
      });
      const merged = addNarrowedLabels(assignments, extra);
      assignments = merged.assignments;
      narrowed = merged.narrowedCount;
    }
  }

  return { assignments, pool, coarseFits: coarse.length, namedByGrok, narrowed };
}

export function computeOrbitHybridScanMetrics(args: {
  firstPassLeftovers: number;
  refinedLeftovers: number;
  escalatedToGrok: number;
  coarseFits?: number;
  namedByGrok?: number;
  narrowed?: number;
  escalationSkipped?: number;
  usage?: OrbitScanModelUsage;
}): OrbitHybridScanMetrics {
  return {
    firstPassLeftovers: args.firstPassLeftovers,
    refinedLeftovers: args.refinedLeftovers,
    recoveredOnRefine: Math.max(0, args.firstPassLeftovers - args.refinedLeftovers),
    escalatedToGrok: args.escalatedToGrok,
    coarseFits: args.coarseFits ?? 0,
    namedByGrok: args.namedByGrok ?? 0,
    narrowed: args.narrowed ?? 0,
    escalationSkipped: args.escalationSkipped ?? 0,
    ...(args.usage ? { usage: { ...args.usage } } : {}),
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
  proposeLeftoverVocab?: OrbitProposeLeftoverVocab;
  onProgress?: OrbitScanProgressSink;
  deadline?: number;
  usage?: OrbitScanUsageTracker;
}): Promise<{
  assignments: OrbitJevAssignment[];
  firstPassLeftovers: number;
  coarseFits: number;
  namedByGrok: number;
  narrowed: number;
}> {
  args.onProgress?.({ type: "phase", phase: "match" });
  const firstPass = await assignOrbitBookmarksWithJev({
    bookmarks: args.bookmarks,
    existingTags: args.existingTags,
    existingCollections: args.existingCollections,
    pool: args.pool,
    authorPriorHints: args.authorPriorHints,
    learningHints: args.learningHints,
    neighborHints: args.neighborHints,
    batchVocabulary: args.firstPassBatchVocabulary,
    onAssigned: args.onProgress
      ? (assignment) => args.onProgress?.(orbitScanRowEvent(assignment))
      : undefined,
    signal: deadlineSignal(args.deadline),
    onUsage: args.usage?.onJevUsage,
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
    onProgress: args.onProgress,
    deadline: args.deadline,
    usage: args.usage,
  });
  return {
    assignments: refined.assignments,
    firstPassLeftovers,
    coarseFits: refined.coarseFits,
    namedByGrok: refined.namedByGrok,
    narrowed: refined.narrowed,
  };
}

export async function runHybridOrbitScan(args: {
  bookmarks: OrbitBookmarkForScan[];
  existingTags: OrbitTagContext[];
  existingCollections: OrbitCollectionContext[];
  authorPriorHints?: OrbitAuthorPriorHint[];
  learningHints?: OrbitLearningHint[];
  neighborHints?: Array<{ bookmarkId: string; hint: OrbitNeighborHint }>;
  batch?: OrbitScanBatchMetadata;
  /** Grok tags what is still left over; Jev checks those tags before they land. */
  escalateLeftovers?: OrbitEscalateLeftovers;
  /** Grok names a few new labels; Jev places them before any full Grok assignment. */
  proposeLeftoverVocab?: OrbitProposeLeftoverVocab;
  onProgress?: OrbitScanProgressSink;
  /** Epoch ms by which the scan must finish (the route's maxDuration less a margin). */
  deadline?: number;
}): Promise<OrbitScanResponsePayload> {
  const seed = buildSeedOrbitLabelPool(args);
  const tracker = createOrbitScanUsageTracker();
  const {
    assignments,
    firstPassLeftovers,
    coarseFits,
    namedByGrok,
    narrowed,
  } = await assignAndRefineOrbitJev({
    bookmarks: args.bookmarks,
    existingTags: args.existingTags,
    existingCollections: args.existingCollections,
    pool: seed,
    authorPriorHints: args.authorPriorHints,
    learningHints: args.learningHints,
    neighborHints: args.neighborHints,
    proposeLeftoverVocab: args.proposeLeftoverVocab,
    onProgress: args.onProgress,
    deadline: args.deadline,
    usage: tracker,
  });
  let rawPlan = jevAssignmentsToRawPlan(assignments);

  const leftovers = selectOrbitJevLeftovers(assignments);
  let escalatedToGrok = 0;
  let escalationSkipped = 0;
  const escalationBudget =
    leftovers.length > 0 && args.escalateLeftovers
      ? grokCallBudgetMs(args.deadline, ORBIT_GROK_ESCALATION_TIMEOUT_MS)
      : null;
  if (leftovers.length > 0 && args.escalateLeftovers && escalationBudget === null) {
    escalationSkipped = leftovers.length;
    logWarn(
      "OrbitHybrid",
      `Skipped Grok tagging for ${leftovers.length} leftovers: the scan is short on time.`
    );
  } else if (leftovers.length > 0 && args.escalateLeftovers && escalationBudget !== null) {
    const escalate = args.escalateLeftovers;
    const leftoverIds = new Set(leftovers.map((assignment) => assignment.bookmarkId));
    const leftoverBookmarks = args.bookmarks.filter((bookmark) =>
      leftoverIds.has(bookmark.id)
    );
    args.onProgress?.({
      type: "phase",
      phase: "name",
      bookmarkIds: [...leftoverIds],
    });
    // Chunks run in parallel; a failed chunk keeps its Jev abstentions and is
    // excluded from the escalated count so the metrics stay honest.
    const settled = await Promise.allSettled(
      chunkItems(leftoverBookmarks, ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN).map(
        async (chunk) => {
          const chunkIds = new Set(chunk.map((bookmark) => bookmark.id));
          try {
            const notes = leftoverNotesFromAssignments(
              leftovers.filter((assignment) => chunkIds.has(assignment.bookmarkId))
            );
            const plan = await escalate(chunk, notes, {
              timeoutMs: escalationBudget,
              onUsage: tracker.onGrokUsage,
            });
            // Grok tagged what Jev could not place; Jev still judges each tag,
            // so its confidence means the same as on every other row.
            const suggestions = await verifyOrbitSuggestionsWithJev({
              bookmarks: chunk,
              suggestions: plan.suggestions.filter((suggestion) =>
                chunkIds.has(suggestion.bookmarkId)
              ),
              existingTags: args.existingTags,
              existingCollections: args.existingCollections,
              signal: deadlineSignal(args.deadline),
              onUsage: tracker.onJevUsage,
            });
            return { chunkIds, plan: { ...plan, suggestions } };
          } finally {
            args.onProgress?.({ type: "named", bookmarkIds: [...chunkIds] });
          }
        }
      )
    );
    for (const result of settled) {
      if (result.status === "fulfilled") {
        rawPlan = mergeOrbitScanPlans(rawPlan, result.value.plan, result.value.chunkIds);
        escalatedToGrok += result.value.chunkIds.size;
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
    bookmarks: args.bookmarks.map((bookmark) => ({
      id: bookmark.id,
      media: bookmark.media,
    })),
  });

  const runtime = getOrbitXaiRuntimeStatus();
  const jevModel = getTypeSafeModel();
  const grokUsed = escalatedToGrok > 0 || namedByGrok > 0;
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
        coarseFits,
        namedByGrok,
        narrowed,
        escalationSkipped,
        usage: tracker.usage,
      }),
    },
    plan,
    summary: buildOrbitScanSummary(plan),
    tagRollups: buildOrbitTagRollups(plan),
    collectionRollups: buildOrbitCollectionRollups(plan),
  };
}
