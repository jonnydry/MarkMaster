import "server-only";

import { normalizeKey } from "@/lib/orbit-grok-normalize";
import type {
  OrbitDecisionEventAction,
  OrbitDecisionEventPayload,
  OrbitSuggestionOrigin,
} from "@/types";

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

// ── Threshold calibration from recorded review decisions ────────────────────

/** One tag a scan suggested, with Jev's score (when it had one) and the user's verdict. */
export type OrbitTagOutcome = {
  name: string;
  score: number | null;
  origin: OrbitSuggestionOrigin | null;
  kept: boolean;
};

const ORIGINS = new Set<string>(["jev", "jev_new_name", "grok"]);
const MACHINE_DECISION_SOURCES = new Set(["tag-audit", "auto-tag"]);

export function isHumanOrbitDecision(event: { source?: string | null }) {
  return event.source == null || event.source === "" || !MACHINE_DECISION_SOURCES.has(event.source);
}

export function humanCalibrationEventWhere(userId?: string) {
  return {
    ...(userId ? { userId } : {}),
  };
}

export function autoTagCalibrationEventWhere(userId?: string) {
  return {
    ...(userId ? { userId } : {}),
  };
}

/**
 * Per-tag verdicts from one review event. Accepted or edited: a suggested tag
 * was kept when it is still on the reviewed suggestion (an accept with no
 * reviewed copy keeps them all). Kept in Orbit or rejected: none were kept.
 */
export function tagOutcomesFromEvent(
  event: Pick<OrbitDecisionEventPayload, "action" | "originalSuggestion" | "reviewedSuggestion">
): OrbitTagOutcome[] {
  const original = event.originalSuggestion?.tags ?? [];
  if (original.length === 0) return [];
  const positive = event.action === "accepted" || event.action === "edited";
  const reviewed = event.reviewedSuggestion
    ? new Set(event.reviewedSuggestion.tags.map((tag) => normalizeKey(tag.name)))
    : null;

  return original.flatMap((tag) => {
    if (typeof tag.name !== "string" || !tag.name.trim()) return [];
    const kept =
      positive && (reviewed ? reviewed.has(normalizeKey(tag.name)) : event.action === "accepted");
    return [
      {
        name: tag.name,
        score:
          typeof tag.score === "number" && Number.isFinite(tag.score) ? tag.score : null,
        origin:
          typeof tag.origin === "string" && ORIGINS.has(tag.origin)
            ? (tag.origin as OrbitSuggestionOrigin)
            : null,
        kept,
      },
    ];
  });
}

export const ORBIT_CALIBRATION_THRESHOLDS = [
  0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95,
] as const;

export type OrbitThresholdRow = {
  threshold: number;
  /** Scored tags at or above the threshold. */
  suggested: number;
  /** Of those, tags the user kept. */
  kept: number;
  /** kept / suggested; null with nothing suggested. */
  precision: number | null;
  /** Share of all kept scored tags that clear the threshold; null with none kept. */
  recall: number | null;
};

export type OrbitOriginRow = {
  origin: OrbitSuggestionOrigin | "unknown";
  suggested: number;
  kept: number;
  keptRate: number | null;
};

/**
 * How well Jev's tag scores predicted what users kept, per candidate
 * threshold, plus the keep rate of each step that produced tags. Scores are
 * stored on every hybrid suggestion, so this needs no model calls: it reads
 * the review history the decision-events endpoint already records.
 */
export function calibrateOrbitTagThresholds(
  events: Array<Pick<OrbitDecisionEventPayload, "action" | "originalSuggestion" | "reviewedSuggestion">>,
  thresholds: readonly number[] = ORBIT_CALIBRATION_THRESHOLDS
) {
  const outcomes = events.flatMap(tagOutcomesFromEvent);
  const scored = outcomes.filter(
    (outcome): outcome is OrbitTagOutcome & { score: number } => outcome.score !== null
  );
  const totalKept = scored.filter((outcome) => outcome.kept).length;

  const rows: OrbitThresholdRow[] = thresholds.map((threshold) => {
    const atOrAbove = scored.filter((outcome) => outcome.score >= threshold);
    const kept = atOrAbove.filter((outcome) => outcome.kept).length;
    return {
      threshold,
      suggested: atOrAbove.length,
      kept,
      precision: atOrAbove.length === 0 ? null : kept / atOrAbove.length,
      recall: totalKept === 0 ? null : kept / totalKept,
    };
  });

  const byOrigin = new Map<OrbitOriginRow["origin"], { suggested: number; kept: number }>();
  for (const outcome of outcomes) {
    const key = outcome.origin ?? "unknown";
    const entry = byOrigin.get(key) ?? { suggested: 0, kept: 0 };
    entry.suggested += 1;
    if (outcome.kept) entry.kept += 1;
    byOrigin.set(key, entry);
  }

  return {
    tagCount: outcomes.length,
    scoredTagCount: scored.length,
    rows,
    origins: [...byOrigin].map(
      ([origin, { suggested, kept }]): OrbitOriginRow => ({
        origin,
        suggested,
        kept,
        keptRate: suggested === 0 ? null : kept / suggested,
      })
    ),
  };
}
