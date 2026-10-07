import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";
import { noul, type EntryType } from "@typesafe-ai/sdk";

import {
  ORBIT_JEV_ASSIGN_CONCURRENCY,
  ORBIT_JEV_TAG_INCLUDE_THRESHOLD,
  ORBIT_JEV_TAG_STRONG_THRESHOLD,
} from "@/lib/orbit-config";
import {
  getOrbitLearningHintsForScan,
  recordOrbitDecisionEvents,
} from "@/lib/orbit-decision-events";
import { buildBookmarkPayload, truncateText } from "@/lib/orbit-grok-normalize";
import { extractXaiResponsesOutputText } from "@/lib/orbit-grok-parse";
import {
  ORBIT_XAI_REASONING_EFFORT,
  OrbitScanError,
  getOrbitXaiRuntimeStatus,
  type OrbitBookmarkForScan,
  type OrbitTagContext,
} from "@/lib/orbit-grok-schemas";
import {
  mapJevScoreToConfidence,
  shortlistOrbitTagsForJev,
  type OrbitLabelPoolItem,
} from "@/lib/orbit-jev-assign";
import { loadOrbitLabelExamples } from "@/lib/orbit-label-examples";
import { prisma } from "@/lib/prisma";
import {
  orbitScanBookmarkInclude,
  withOrbitFolderHints,
} from "@/lib/orbit-scan-bookmarks";
import { getTypeSafeClient, getTypeSafeModel } from "@/lib/typesafe";
import type { OrbitDecisionEventPayload } from "@/types";

export const ORBIT_TAG_AUDIT_GROK_CAP = 24;

export const ORBIT_TAG_AUDIT_BOOKMARK_CAP = 80;

export const ORBIT_TAG_AUDIT_CLASH_MARGIN = 0.2;

export const ORBIT_TAG_AUDIT_RIVAL_CAP = 8;

export const ORBIT_TAG_AUDIT_GROK_TIMEOUT_MS = 60_000;

const REASON_MAX = 180;
const TAG_NAME_MAX = 50;
const EXCERPT_MAX = 200;
const REJECTION_REASON_FALLBACK = "Rejected from the tag audit.";
const PAIR_KEY_SEPARATOR = ":";
const FALLBACK_TAG_COLOR = "#64748b";
const TAG_AUDIT_SOURCE = "tag-audit";
const TAG_AUDIT_MODE = "audit";
const GROK_SCHEMA_NAME = "orbit_tag_audit_verdicts";
const GROK_PROMPT_CACHE_KEY = "markmaster-orbit-tag-audit";

const TAG_AUDIT_GROK_SYSTEM_PROMPT = [
  "You are checking a proposed tag correction for one bookmark.",
  "Each item has the post, the current tag, and one action.",
  "The action is remove, or swap to the named existing tag.",
  "Agree only when that action is right.",
  "Do not invent tag names.",
  "Do not propose a different action.",
  "The reason is one sentence of at most 180 characters.",
].join(" ");

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pairKey", "agree", "reason"],
        properties: {
          pairKey: { type: "string" },
          agree: { type: "boolean" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

export type OutstandingUndoChoice = "release" | "block";

export type TagAuditSuggestion =
  | { kind: "remove" }
  | { kind: "swap"; tagId: string; name: string; color: string };

export type TagAuditProposalView = {
  id: string;
  bookmarkId: string;
  authorUsername: string;
  excerpt: string;
  currentTag: { id: string; name: string; color: string };
  suggestion: TagAuditSuggestion;
  reason: string;
  checked: boolean;
};

export type TagAuditCoverage = {
  taggedBookmarkCount: number;
  judgedBookmarkCount: number;
  bookmarkCap: number;
};

export type TagAuditPhase = "open" | "applied" | "undone";

export type TagAuditView = {
  auditId: string;
  phase: TagAuditPhase;
  coverage: TagAuditCoverage;
  /** True only when phase is applied and the snapshot is neither restored nor released. */
  undoAvailable: boolean;
  proposals: TagAuditProposalView[];
};

export type TagAuditApplyResult = {
  auditId: string;
  phase: "open" | "applied";
  appliedProposalIds: string[];
  skippedProposalIds: string[];
  rejectionsRecorded: number;
  alreadyApplied: boolean;
};

export type TagAuditUndoResult = {
  auditId: string;
  restoredBookmarkIds: string[];
  alreadyUndone: boolean;
};

export class OrbitTagAuditError extends Error {
  readonly status: number;
  readonly code:
    | "not_configured"
    | "not_found"
    | "closed"
    | "undo_outstanding"
    | "undo_unavailable"
    | "undo_tag_missing";

  constructor(
    message: string,
    status: number,
    code: OrbitTagAuditError["code"],
  ) {
    super(message);
    this.name = "OrbitTagAuditError";
    this.status = status;
    this.code = code;
  }
}

type ScoredLabel = {
  tagId: string;
  name: string;
  score: number;
};

type FlaggedPair = {
  pairKey: string;
  bookmarkId: string;
  tagId: string;
  currentName: string;
  currentScore: number;
  margin: number;
  suggestion: { kind: "remove" } | { kind: "swap"; tagId: string; name: string };
  reason: string;
};

type ApplyOutcome = {
  appliedProposalIds: string[];
  skippedProposalIds: string[];
};

type ParsedProposal = {
  id: string;
  bookmarkId: string;
  tagId: string;
  suggestion: { kind: "remove" } | { kind: "swap"; tagId: string };
  reason: string;
  currentScore: number;
  checked: boolean;
  rank: number;
};

type ParsedUndo = {
  joins: Array<{ bookmarkId: string; tagIds: string[] }>;
  restoredAt: string | null;
  releasedAt: string | null;
};

type ParsedAudit = {
  id: string;
  phase: TagAuditPhase;
  taggedBookmarkCount: number;
  judgedBookmarkCount: number;
  vetoedPairKeys: string[];
  outcome: ApplyOutcome | null;
  rejectionsRecorded: boolean;
  appliedAt: Date | null;
  undo: ParsedUndo | null;
  proposals: ParsedProposal[];
};

type PairRef = { bookmarkId: string; tagId: string };

type ApplyPlan = {
  deletes: PairRef[];
  inserts: PairRef[];
  appliedProposalIds: string[];
  skippedProposalIds: string[];
  touchedBookmarkIds: string[];
};

type LibraryTag = {
  id: string;
  name: string;
  color: string;
  examples?: string[];
};

type AuditRow = {
  id: string;
  userId: string;
  phase: string;
  taggedBookmarkCount: number;
  judgedBookmarkCount: number;
  vetoedPairKeys: unknown;
  outcome: unknown;
  rejectionsRecorded: boolean;
  appliedAt: Date | null;
  undo: {
    joins: unknown;
    restoredAt: Date | null;
    releasedAt: Date | null;
  } | null;
  proposals: Array<{
    id: string;
    bookmarkId: string;
    tagId: string;
    kind: string;
    swapTagId: string | null;
    reason: string;
    currentScore: number;
    checked: boolean;
    rank: number;
  }>;
};

type Db = PrismaClient | Prisma.TransactionClient;

type TaggedBookmarkRow = {
  id: string;
  tweetId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorVerified: boolean;
  tweetText: string;
  tweetCreatedAt: Date | string;
  bookmarkedAt: Date | string;
  publicMetrics: unknown;
  media: unknown;
  urls: unknown;
  quotedTweet: unknown;
  xMetadata?: unknown;
  notes: Array<{ id: string; content: string }>;
  collectionItems: Array<{
    collection: { id: string; name: string; type?: string };
  }>;
  tags: Array<{
    tagId: string;
    tag: { id: string; name: string; color: string } | null;
  }>;
};

export function tagAuditCoverageSentence(coverage: TagAuditCoverage): string {
  if (coverage.taggedBookmarkCount === 0) return "No tagged bookmarks.";
  const targeted = Math.min(coverage.taggedBookmarkCount, coverage.bookmarkCap);
  if (coverage.judgedBookmarkCount < targeted) {
    return `Reviewed ${coverage.judgedBookmarkCount} of ${coverage.taggedBookmarkCount} tagged bookmarks before the time budget ran out.`;
  }
  if (coverage.taggedBookmarkCount > coverage.bookmarkCap) {
    return `Reviewed the newest ${coverage.bookmarkCap} of ${coverage.taggedBookmarkCount} tagged bookmarks.`;
  }
  return `Reviewed all ${coverage.taggedBookmarkCount} tagged bookmarks.`;
}

function oneLineReason(value: string, fallback: string): string {
  const line = value.replace(/\s+/g, " ").trim().slice(0, REASON_MAX);
  return line.length > 0 ? line : fallback;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function cssHexColor(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : FALLBACK_TAG_COLOR;
}

function tagPairKey(bookmarkId: string, tagId: string): string {
  if (
    bookmarkId.includes(PAIR_KEY_SEPARATOR) ||
    tagId.includes(PAIR_KEY_SEPARATOR)
  ) {
    throw new OrbitTagAuditError(
      "Tag audit pair key ids must not contain a colon.",
      500,
      "closed",
    );
  }
  return `${bookmarkId}${PAIR_KEY_SEPARATOR}${tagId}`;
}

function tagFitQuestion(name: string) {
  return noul(`Is the existing tag "${name}" a correct label for this bookmark?`, {
    true: `The post belongs under ${name}.`,
    false: `The post does not belong under ${name}.`,
  });
}

function canRecordRejectionName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= TAG_NAME_MAX;
}

function labelState(tag: { name: string; examples?: string[] }): OrbitLabelPoolItem {
  return {
    name: tag.name,
    existing: true,
    ...(tag.examples?.length ? { examples: tag.examples } : {}),
  };
}

function flagTagPair(args: {
  bookmarkId: string;
  current: ScoredLabel;
  alternatives: readonly ScoredLabel[];
  tagIdsOnBookmark: ReadonlySet<string>;
}): FlaggedPair | null {
  if (!canRecordRejectionName(args.current.name)) return null;
  let challenger: ScoredLabel | null = null;
  for (const candidate of args.alternatives) {
    if (candidate.tagId === args.current.tagId) continue;
    if (args.tagIdsOnBookmark.has(candidate.tagId)) continue;
    if (candidate.score < ORBIT_JEV_TAG_STRONG_THRESHOLD) continue;
    if (
      challenger === null ||
      candidate.score > challenger.score ||
      (candidate.score === challenger.score && candidate.tagId < challenger.tagId)
    ) {
      challenger = candidate;
    }
  }

  const margin = challenger ? challenger.score - args.current.score : 0;
  if (challenger && margin >= ORBIT_TAG_AUDIT_CLASH_MARGIN) {
    const reason = oneLineReason(
      `${challenger.name} fits this post better than ${args.current.name}.`,
      REJECTION_REASON_FALLBACK,
    );
    return {
      pairKey: tagPairKey(args.bookmarkId, args.current.tagId),
      bookmarkId: args.bookmarkId,
      tagId: args.current.tagId,
      currentName: args.current.name,
      currentScore: args.current.score,
      margin,
      suggestion: {
        kind: "swap",
        tagId: challenger.tagId,
        name: challenger.name,
      },
      reason,
    };
  }

  if (args.current.score < ORBIT_JEV_TAG_INCLUDE_THRESHOLD) {
    const reason = oneLineReason(
      `${args.current.name} is a weak match for this post.`,
      REJECTION_REASON_FALLBACK,
    );
    return {
      pairKey: tagPairKey(args.bookmarkId, args.current.tagId),
      bookmarkId: args.bookmarkId,
      tagId: args.current.tagId,
      currentName: args.current.name,
      currentScore: args.current.score,
      margin: 0,
      suggestion: { kind: "remove" },
      reason,
    };
  }

  return null;
}

function rankFlaggedPairs(pairs: readonly FlaggedPair[]): FlaggedPair[] {
  return [...pairs].sort((left, right) => {
    if (left.currentScore !== right.currentScore) {
      return left.currentScore - right.currentScore;
    }
    if (left.margin !== right.margin) return right.margin - left.margin;
    if (left.pairKey < right.pairKey) return -1;
    if (left.pairKey > right.pairKey) return 1;
    return 0;
  });
}

function selectPairsForGrok(
  ranked: readonly FlaggedPair[],
  vetoedPairKeys: ReadonlySet<string>,
): FlaggedPair[] {
  const fresh = ranked.filter((pair) => !vetoedPairKeys.has(pair.pairKey));
  const pool = fresh.length > 0 ? fresh : ranked;
  return pool.slice(0, ORBIT_TAG_AUDIT_GROK_CAP);
}

function mergeOpinions(
  sent: readonly FlaggedPair[],
  verdicts: ReadonlyMap<string, { agree: boolean; reason: string }>,
): { proposals: FlaggedPair[]; vetoedPairKeys: string[] } {
  const proposals: FlaggedPair[] = [];
  const vetoedPairKeys: string[] = [];
  for (const pair of sent) {
    const verdict = verdicts.get(pair.pairKey);
    if (!verdict?.agree) {
      vetoedPairKeys.push(pair.pairKey);
      continue;
    }
    const reason = oneLineReason(verdict.reason, pair.reason);
    proposals.push(reason === pair.reason ? pair : { ...pair, reason });
  }
  return { proposals, vetoedPairKeys };
}

function checkedFlags(
  proposalIds: readonly string[],
  checkedProposalIds: readonly string[],
): Map<string, boolean> {
  assertCheckedIds(proposalIds, checkedProposalIds);
  const wanted = new Set(checkedProposalIds);
  return new Map(proposalIds.map((id) => [id, wanted.has(id)]));
}

function assertCheckedIds(
  proposalIds: readonly string[],
  checkedProposalIds: readonly string[],
): void {
  const known = new Set(proposalIds);
  for (const id of checkedProposalIds) {
    if (!known.has(id)) {
      throw new OrbitTagAuditError(
        "One of the checked proposals is not on this audit.",
        404,
        "not_found",
      );
    }
  }
}

function sameTagSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const tagId of left) {
    if (!right.has(tagId)) return false;
  }
  return true;
}

function compileJoinDelta(args: {
  proposals: readonly ParsedProposal[];
  joinsByBookmark: ReadonlyMap<string, ReadonlySet<string>>;
  liveTagIds: ReadonlySet<string>;
}): ApplyPlan {
  const actions: Array<{
    id: string;
    bookmarkId: string;
    removeTagId: string;
    addTagId: string | null;
  }> = [];
  const skippedProposalIds: string[] = [];

  for (const proposal of args.proposals) {
    if (!proposal.checked) continue;
    const had = args.joinsByBookmark.get(proposal.bookmarkId);
    if (!had || !had.has(proposal.tagId)) {
      skippedProposalIds.push(proposal.id);
      continue;
    }
    if (proposal.suggestion.kind === "swap") {
      const swapTagId = proposal.suggestion.tagId;
      if (swapTagId === proposal.tagId || !args.liveTagIds.has(swapTagId)) {
        skippedProposalIds.push(proposal.id);
        continue;
      }
      actions.push({
        id: proposal.id,
        bookmarkId: proposal.bookmarkId,
        removeTagId: proposal.tagId,
        addTagId: swapTagId,
      });
      continue;
    }
    actions.push({
      id: proposal.id,
      bookmarkId: proposal.bookmarkId,
      removeTagId: proposal.tagId,
      addTagId: null,
    });
  }

  const byBookmark = new Map<string, typeof actions>();
  for (const action of actions) {
    const list = byBookmark.get(action.bookmarkId) ?? [];
    list.push(action);
    byBookmark.set(action.bookmarkId, list);
  }

  const deletes: PairRef[] = [];
  const inserts: PairRef[] = [];
  const appliedProposalIds: string[] = [];
  const touchedBookmarkIds: string[] = [];

  for (const [bookmarkId, rows] of byBookmark) {
    const had = args.joinsByBookmark.get(bookmarkId) ?? new Set<string>();
    const remove = new Set(rows.map((row) => row.removeTagId));
    const add = new Set<string>();
    for (const row of rows) {
      if (row.addTagId && !remove.has(row.addTagId)) add.add(row.addTagId);
    }
    const next = new Set(had);
    for (const tagId of remove) next.delete(tagId);
    for (const tagId of add) next.add(tagId);
    if (sameTagSet(had, next)) {
      for (const row of rows) skippedProposalIds.push(row.id);
      continue;
    }
    for (const tagId of had) {
      if (!next.has(tagId)) deletes.push({ bookmarkId, tagId });
    }
    for (const tagId of next) {
      if (!had.has(tagId)) inserts.push({ bookmarkId, tagId });
    }
    touchedBookmarkIds.push(bookmarkId);
    for (const row of rows) appliedProposalIds.push(row.id);
  }

  return {
    deletes,
    inserts,
    appliedProposalIds,
    skippedProposalIds,
    touchedBookmarkIds,
  };
}

function snapshotTagSets(
  touchedBookmarkIds: readonly string[],
  joinsByBookmark: ReadonlyMap<string, ReadonlySet<string>>,
): Array<{ bookmarkId: string; tagIds: string[] }> {
  return touchedBookmarkIds.map((bookmarkId) => ({
    bookmarkId,
    tagIds: [...(joinsByBookmark.get(bookmarkId) ?? [])].sort(),
  }));
}

function buildTagAuditRejection(args: {
  bookmarkId: string;
  tagName: string;
  tagColor: string;
  reason: string;
  currentScore: number;
}): OrbitDecisionEventPayload {
  const reason = oneLineReason(args.reason, REJECTION_REASON_FALLBACK);
  return {
    bookmarkId: args.bookmarkId,
    action: "rejected",
    source: TAG_AUDIT_SOURCE,
    mode: TAG_AUDIT_MODE,
    reviewedSuggestion: null,
    originalSuggestion: {
      bookmarkId: args.bookmarkId,
      confidence: mapJevScoreToConfidence(args.currentScore, null),
      reasoning: reason,
      collection: null,
      tags: [
        {
          name: args.tagName,
          color: cssHexColor(args.tagColor),
          reason,
          reuseExisting: true,
          score: args.currentScore,
          origin: "jev",
        },
      ],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseGrokVerdicts(
  raw: unknown,
  expectedKeys: ReadonlySet<string>,
): Map<string, { agree: boolean; reason: string }> {
  if (!isRecord(raw) || !Array.isArray(raw.verdicts)) {
    throw new OrbitScanError(
      "Tag audit second opinion returned no verdicts.",
      502,
      "xai_response",
    );
  }
  const verdicts = new Map<string, { agree: boolean; reason: string }>();
  for (const item of raw.verdicts) {
    if (!isRecord(item)) continue;
    if (typeof item.pairKey !== "string" || !expectedKeys.has(item.pairKey)) {
      continue;
    }
    if (typeof item.agree !== "boolean") continue;
    if (verdicts.has(item.pairKey)) continue;
    verdicts.set(item.pairKey, {
      agree: item.agree,
      reason: typeof item.reason === "string" ? item.reason : "",
    });
  }
  return verdicts;
}

function parseSuggestion(kind: unknown, swapTagId: unknown): ParsedProposal["suggestion"] {
  if (kind === "remove" && (swapTagId === null || swapTagId === undefined)) {
    return { kind: "remove" };
  }
  if (kind === "swap" && typeof swapTagId === "string" && swapTagId.length > 0) {
    return { kind: "swap", tagId: swapTagId };
  }
  throw new OrbitTagAuditError(
    "Tag audit proposal kind does not match its swap tag.",
    500,
    "closed",
  );
}

function parseAuditRow(row: AuditRow): ParsedAudit {
  if (row.phase !== "open" && row.phase !== "applied" && row.phase !== "undone") {
    throw new OrbitTagAuditError("Tag audit phase is unknown.", 500, "closed");
  }
  const vetoedPairKeys = parseStringList(row.vetoedPairKeys, "Tag audit veto list");
  const outcome = parseOutcome(row.outcome);
  if (row.phase === "applied" && !outcome) {
    throw new OrbitTagAuditError(
      "An applied tag audit is missing its outcome.",
      500,
      "closed",
    );
  }
  if (row.phase === "applied" && !row.undo) {
    throw new OrbitTagAuditError(
      "An applied tag audit is missing its undo snapshot.",
      500,
      "closed",
    );
  }
  if (row.phase !== "applied" && outcome) {
    throw new OrbitTagAuditError(
      "Only an applied tag audit stores an outcome.",
      500,
      "closed",
    );
  }

  return {
    id: row.id,
    phase: row.phase,
    taggedBookmarkCount: row.taggedBookmarkCount,
    judgedBookmarkCount: row.judgedBookmarkCount,
    vetoedPairKeys,
    outcome,
    rejectionsRecorded: row.rejectionsRecorded,
    appliedAt: row.appliedAt,
    undo: row.undo
      ? {
          joins: parseJoins(row.undo.joins),
          restoredAt: row.undo.restoredAt?.toISOString() ?? null,
          releasedAt: row.undo.releasedAt?.toISOString() ?? null,
        }
      : null,
    proposals: row.proposals.map((proposal) => {
      if (proposal.reason.trim().length === 0 || proposal.reason.length > REASON_MAX) {
        throw new OrbitTagAuditError(
          "Tag audit reason is outside 1 to 180 characters.",
          500,
          "closed",
        );
      }
      if (
        !Number.isFinite(proposal.currentScore) ||
        proposal.currentScore < 0 ||
        proposal.currentScore > 1
      ) {
        throw new OrbitTagAuditError(
          "Tag audit score is outside 0 to 1.",
          500,
          "closed",
        );
      }
      return {
        id: proposal.id,
        bookmarkId: proposal.bookmarkId,
        tagId: proposal.tagId,
        suggestion: parseSuggestion(proposal.kind, proposal.swapTagId),
        reason: proposal.reason,
        currentScore: proposal.currentScore,
        checked: proposal.checked,
        rank: proposal.rank,
      };
    }),
  };
}

function parseOutcome(value: unknown): ApplyOutcome | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) {
    throw new OrbitTagAuditError("Tag audit outcome is unreadable.", 500, "closed");
  }
  const applied = stringArray(value.appliedProposalIds);
  const skipped = stringArray(value.skippedProposalIds);
  if (!applied || !skipped) {
    throw new OrbitTagAuditError("Tag audit outcome is unreadable.", 500, "closed");
  }
  return { appliedProposalIds: applied, skippedProposalIds: skipped };
}

function parseJoins(value: unknown): Array<{ bookmarkId: string; tagIds: string[] }> {
  if (!Array.isArray(value)) {
    throw new OrbitTagAuditError("Tag audit undo snapshot is unreadable.", 500, "closed");
  }
  return value.map((entry) => {
    if (!isRecord(entry) || typeof entry.bookmarkId !== "string") {
      throw new OrbitTagAuditError(
        "Tag audit undo snapshot is unreadable.",
        500,
        "closed",
      );
    }
    const tagIds = stringArray(entry.tagIds);
    if (!tagIds) {
      throw new OrbitTagAuditError(
        "Tag audit undo snapshot is unreadable.",
        500,
        "closed",
      );
    }
    return { bookmarkId: entry.bookmarkId, tagIds: [...tagIds].sort() };
  });
}

function parseStringList(value: unknown, label: string): string[] {
  const parsed = stringArray(value);
  if (!parsed) {
    throw new OrbitTagAuditError(`${label} is unreadable.`, 500, "closed");
  }
  return parsed;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((item) => typeof item === "string")) return null;
  return value;
}

function undoAvailable(audit: ParsedAudit): boolean {
  return (
    audit.phase === "applied" &&
    audit.undo !== null &&
    audit.undo.restoredAt === null &&
    audit.undo.releasedAt === null
  );
}

function toTagAuditView(
  audit: ParsedAudit,
  bookmarks: ReadonlyMap<string, { authorUsername: string; excerpt: string }>,
  tags: ReadonlyMap<string, { name: string; color: string }>,
): TagAuditView {
  const proposals: TagAuditProposalView[] = [];
  for (const proposal of [...audit.proposals].sort((left, right) => left.rank - right.rank)) {
    const bookmark = bookmarks.get(proposal.bookmarkId);
    const current = tags.get(proposal.tagId);
    if (!bookmark || !current) continue;
    if (proposal.suggestion.kind === "swap") {
      const swap = tags.get(proposal.suggestion.tagId);
      if (!swap) continue;
      proposals.push({
        id: proposal.id,
        bookmarkId: proposal.bookmarkId,
        authorUsername: bookmark.authorUsername,
        excerpt: bookmark.excerpt,
        currentTag: {
          id: proposal.tagId,
          name: current.name,
          color: cssHexColor(current.color),
        },
        suggestion: {
          kind: "swap",
          tagId: proposal.suggestion.tagId,
          name: swap.name,
          color: cssHexColor(swap.color),
        },
        reason: proposal.reason,
        checked: proposal.checked,
      });
      continue;
    }
    proposals.push({
      id: proposal.id,
      bookmarkId: proposal.bookmarkId,
      authorUsername: bookmark.authorUsername,
      excerpt: bookmark.excerpt,
      currentTag: {
        id: proposal.tagId,
        name: current.name,
        color: cssHexColor(current.color),
      },
      suggestion: { kind: "remove" },
      reason: proposal.reason,
      checked: proposal.checked,
    });
  }

  return {
    auditId: audit.id,
    phase: audit.phase,
    undoAvailable: undoAvailable(audit),
    coverage: {
      taggedBookmarkCount: audit.taggedBookmarkCount,
      judgedBookmarkCount: audit.judgedBookmarkCount,
      bookmarkCap: ORBIT_TAG_AUDIT_BOOKMARK_CAP,
    },
    proposals,
  };
}

function grokUserPayload(
  pairs: readonly FlaggedPair[],
  excerpts: ReadonlyMap<string, string>,
) {
  return pairs.map((pair) => ({
    pairKey: pair.pairKey,
    excerpt: excerpts.get(pair.bookmarkId) ?? "",
    currentTag: pair.currentName,
    action: pair.suggestion.kind,
    swapTag: pair.suggestion.kind === "swap" ? pair.suggestion.name : null,
    reason: pair.reason,
  }));
}

function assertWithinGrokCap(count: number): void {
  if (count > ORBIT_TAG_AUDIT_GROK_CAP) {
    throw new Error(
      `Tag audit tried to send ${count} pairs to Grok. ORBIT_TAG_AUDIT_GROK_CAP is ${ORBIT_TAG_AUDIT_GROK_CAP}.`,
    );
  }
}

function requireApiKey(name: "TYPESAFE_API_KEY" | "XAI_API_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new OrbitTagAuditError(
      `${name} is not set.`,
      503,
      "not_configured",
    );
  }
  return value;
}

function readNoul(answer: unknown): number | null {
  if (!isRecord(answer) || !("noul" in answer)) return null;
  const value = answer.noul;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function toJsonState(value: unknown): EntryType {
  return JSON.parse(JSON.stringify(value)) as EntryType;
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  const resetTime = Date.parse(value);
  if (!Number.isNaN(resetTime)) {
    const resetSeconds = Math.ceil((resetTime - Date.now()) / 1000);
    return resetSeconds > 0 ? resetSeconds : undefined;
  }
  return undefined;
}

function extractXaiErrorMessage(body: unknown, fallback: string): string {
  if (!isRecord(body) || !("error" in body)) return fallback;
  const error = body.error;
  if (typeof error === "string") return error;
  if (isRecord(error) && "message" in error) return String(error.message);
  return fallback;
}

function auditInclude() {
  return {
    proposals: { orderBy: { rank: "asc" as const } },
    undo: true,
  };
}

async function findAuditRow(
  db: Db,
  userId: string,
  auditId?: string,
): Promise<AuditRow | null> {
  const row = await db.orbitTagAudit.findFirst({
    where: auditId ? { id: auditId, userId } : { userId },
    ...(auditId ? {} : { orderBy: { createdAt: "desc" as const } }),
    include: auditInclude(),
  });
  return row as AuditRow | null;
}

async function viewFromAudit(userId: string, audit: ParsedAudit): Promise<TagAuditView> {
  const bookmarkIds = [...new Set(audit.proposals.map((proposal) => proposal.bookmarkId))];
  const tagIds = new Set<string>();
  for (const proposal of audit.proposals) {
    tagIds.add(proposal.tagId);
    if (proposal.suggestion.kind === "swap") tagIds.add(proposal.suggestion.tagId);
  }
  const [bookmarks, tags] = await Promise.all([
    bookmarkIds.length === 0
      ? []
      : prisma.bookmark.findMany({
          where: { userId, id: { in: bookmarkIds } },
          select: { id: true, authorUsername: true, tweetText: true },
        }),
    tagIds.size === 0
      ? []
      : prisma.tag.findMany({
          where: { userId, id: { in: [...tagIds] } },
          select: { id: true, name: true, color: true },
        }),
  ]);
  return toTagAuditView(
    audit,
    new Map(
      bookmarks.map((bookmark) => [
        bookmark.id,
        {
          authorUsername: bookmark.authorUsername,
          excerpt: truncateText(bookmark.tweetText, EXCERPT_MAX) ?? "",
        },
      ]),
    ),
    new Map(tags.map((tag) => [tag.id, { name: tag.name, color: tag.color }])),
  );
}

async function readyUndo(db: Db, userId: string) {
  return db.orbitTagAuditUndo.findFirst({
    where: {
      userId,
      restoredAt: null,
      releasedAt: null,
      audit: { userId, phase: "applied" },
    },
    select: { auditId: true },
  });
}

async function lockOrbitApply(db: Prisma.TransactionClient, userId: string) {
  await db.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtext(${`orbit-apply:${userId}`}))
  `);
}

function pickRivals(
  library: readonly LibraryTag[],
  currentIds: ReadonlySet<string>,
  payload: ReturnType<typeof buildBookmarkPayload>,
): LibraryTag[] {
  const pool = library.filter((tag) => !currentIds.has(tag.id));
  const byName = new Map(pool.map((tag) => [tag.name, tag]));
  const shortlist = shortlistOrbitTagsForJev({
    pool: pool.map((tag) => labelState(tag)),
    payload,
    maxCount: ORBIT_TAG_AUDIT_RIVAL_CAP,
  });
  const rivals: LibraryTag[] = [];
  for (const item of shortlist) {
    const tag = byName.get(item.name);
    if (!tag) continue;
    rivals.push(tag);
    if (rivals.length >= ORBIT_TAG_AUDIT_RIVAL_CAP) break;
  }
  return rivals;
}

async function scoreBookmark(args: {
  bookmark: OrbitBookmarkForScan;
  current: readonly LibraryTag[];
  rivals: readonly LibraryTag[];
  payload: ReturnType<typeof buildBookmarkPayload>;
  signal?: AbortSignal;
}): Promise<FlaggedPair[]> {
  const askable = args.current.filter((tag) => canRecordRejectionName(tag.name));
  if (askable.length === 0) return [];

  const questions: Record<string, ReturnType<typeof noul>> = {};
  for (const [index, tag] of askable.entries()) {
    questions[`current_${index}`] = tagFitQuestion(tag.name);
  }
  for (const [index, tag] of args.rivals.entries()) {
    questions[`rival_${index}`] = tagFitQuestion(tag.name);
  }

  let answers: Record<string, unknown> = {};
  try {
    const client = getTypeSafeClient();
    const response = await client.systemOne(
      {
        model: getTypeSafeModel(),
        state: toJsonState({
          ...args.payload,
          candidateTags: [...askable, ...args.rivals].map((tag) => labelState(tag)),
        }),
        questions,
      },
      args.signal ? { signal: args.signal } : undefined,
    );
    answers = response.answers ?? {};
  } catch {
    return [];
  }

  const currentScores: ScoredLabel[] = [];
  for (const [index, tag] of askable.entries()) {
    const noulScore = readNoul(answers[`current_${index}`]);
    if (noulScore === null) return [];
    currentScores.push({
      tagId: tag.id,
      name: tag.name,
      score: clampUnit(noulScore),
    });
  }
  const rivalScores: ScoredLabel[] = args.rivals.map((tag, index) => ({
    tagId: tag.id,
    name: tag.name,
    score: clampUnit(readNoul(answers[`rival_${index}`]) ?? 0),
  }));
  const tagIdsOnBookmark = new Set(args.current.map((tag) => tag.id));
  const flagged: FlaggedPair[] = [];
  for (const current of currentScores) {
    const pair = flagTagPair({
      bookmarkId: args.bookmark.id,
      current,
      alternatives: rivalScores,
      tagIdsOnBookmark,
    });
    if (pair) flagged.push(pair);
  }
  return flagged;
}

async function weighWithGrok(
  pairs: readonly FlaggedPair[],
  excerpts: ReadonlyMap<string, string>,
): Promise<Map<string, { agree: boolean; reason: string }>> {
  assertWithinGrokCap(pairs.length);
  const apiKey = requireApiKey("XAI_API_KEY");
  const runtimeStatus = getOrbitXaiRuntimeStatus();
  const expectedKeys = new Set(pairs.map((pair) => pair.pairKey));

  let response: Response;
  try {
    response = await fetch(`${runtimeStatus.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: runtimeStatus.model,
        input: [
          { role: "system", content: TAG_AUDIT_GROK_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify(grokUserPayload(pairs, excerpts)),
          },
        ],
        store: false,
        prompt_cache_key: GROK_PROMPT_CACHE_KEY,
        reasoning: { effort: ORBIT_XAI_REASONING_EFFORT },
        text: {
          format: {
            type: "json_schema",
            name: GROK_SCHEMA_NAME,
            schema: VERDICT_SCHEMA,
            strict: true,
          },
        },
      }),
      signal: AbortSignal.timeout(ORBIT_TAG_AUDIT_GROK_TIMEOUT_MS),
    });
  } catch {
    throw new OrbitScanError(
      "xAI could not be reached. Try the scan again in a moment.",
      503,
      "xai_unavailable",
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = extractXaiErrorMessage(
      body,
      `xAI request failed with status ${response.status}`,
    );
    if (response.status === 401 || response.status === 403) {
      throw new OrbitScanError(
        "xAI rejected the request. Confirm your API key and model access.",
        502,
        "xai_auth",
      );
    }
    if (
      response.status === 404 ||
      (response.status === 400 && /model/i.test(message))
    ) {
      throw new OrbitScanError(
        "xAI could not find the configured Grok model.",
        502,
        "xai_model",
      );
    }
    if (response.status === 429) {
      throw new OrbitScanError(
        "xAI rate limit reached. Try the scan again in a moment.",
        429,
        "xai_rate_limited",
        {
          retryAfterSeconds: parseRetryAfterSeconds(
            response.headers.get("retry-after"),
          ),
        },
      );
    }
    throw new OrbitScanError(message, 502, "xai_unavailable");
  }

  const payload = await response.json().catch(() => null);
  if (isRecord(payload) && payload.status === "incomplete") {
    throw new OrbitScanError(
      "xAI stopped before finishing the Orbit scan. Try a smaller batch.",
      502,
      "xai_response",
    );
  }
  const rawText = extractXaiResponsesOutputText(payload);
  if (!rawText) {
    throw new OrbitScanError(
      "xAI returned an empty Orbit scan.",
      502,
      "xai_response",
    );
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    throw new OrbitScanError(
      "xAI returned invalid JSON for the Orbit scan.",
      502,
      "xai_response",
    );
  }
  return parseGrokVerdicts(parsedJson, expectedKeys);
}

function bookmarkForScan(row: ReturnType<typeof withOrbitFolderHints<TaggedBookmarkRow>>): OrbitBookmarkForScan {
  return {
    id: row.id,
    tweetId: row.tweetId,
    authorUsername: row.authorUsername,
    authorDisplayName: row.authorDisplayName,
    authorVerified: row.authorVerified,
    tweetText: row.tweetText,
    tweetCreatedAt: row.tweetCreatedAt,
    bookmarkedAt: row.bookmarkedAt,
    publicMetrics: row.publicMetrics,
    media: row.media,
    urls: row.urls,
    quotedTweet: row.quotedTweet,
    xMetadata: row.xMetadata,
    notes: row.notes,
    xFolderHints: row.xFolderHints,
  };
}

async function judgeSlice(args: {
  rows: TaggedBookmarkRow[];
  library: LibraryTag[];
  existingTags: OrbitTagContext[];
  learningByBookmark: ReadonlyMap<
    string,
    Awaited<ReturnType<typeof getOrbitLearningHintsForScan>>[number]
  >;
  stopAt: number;
}): Promise<{ flagged: FlaggedPair[]; judged: number }> {
  const flagged: FlaggedPair[] = [];
  let judged = 0;
  let next = 0;

  async function worker() {
    while (next < args.rows.length) {
      if (Date.now() >= args.stopAt) return;
      const index = next;
      next += 1;
      const row = args.rows[index];
      if (!row) return;
      const folded = withOrbitFolderHints(row);
      const bookmark = bookmarkForScan(folded);
      const current = row.tags.flatMap((join) => (join.tag ? [join.tag] : []));
      const currentIds = new Set(current.map((tag) => tag.id));
      const payload = buildBookmarkPayload({
        bookmark,
        existingTags: args.existingTags,
        existingCollections: [],
        learningHint: args.learningByBookmark.get(row.id),
      });
      const rivals = pickRivals(args.library, currentIds, payload);
      const pairs = await scoreBookmark({
        bookmark,
        current: current.map((tag) => ({
          ...tag,
          examples: args.library.find((item) => item.id === tag.id)?.examples,
        })),
        rivals,
        payload,
      });
      flagged.push(...pairs);
      judged += 1;
    }
  }

  const workers = Math.min(ORBIT_JEV_ASSIGN_CONCURRENCY, args.rows.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return { flagged, judged };
}

async function persistOpenAudit(args: {
  userId: string;
  outstandingUndo: OutstandingUndoChoice;
  taggedBookmarkCount: number;
  judgedBookmarkCount: number;
  proposals: readonly FlaggedPair[];
  vetoedPairKeys: readonly string[];
}) {
  await prisma.$transaction(async (tx) => {
    await lockOrbitApply(tx, args.userId);
    if (args.outstandingUndo === "block") {
      const ready = await readyUndo(tx, args.userId);
      if (ready) {
        throw new OrbitTagAuditError(
          "Undo is still available for the last tag audit.",
          409,
          "undo_outstanding",
        );
      }
    } else {
      await tx.orbitTagAuditUndo.updateMany({
        where: {
          userId: args.userId,
          restoredAt: null,
          releasedAt: null,
          audit: { userId: args.userId, phase: "applied" },
        },
        data: { releasedAt: new Date() },
      });
    }
    await tx.orbitTagAudit.deleteMany({
      where: { userId: args.userId, phase: "open" },
    });
    await tx.orbitTagAudit.create({
      data: {
        id: randomUUID(),
        userId: args.userId,
        phase: "open",
        taggedBookmarkCount: args.taggedBookmarkCount,
        judgedBookmarkCount: args.judgedBookmarkCount,
        vetoedPairKeys: [...args.vetoedPairKeys],
        rejectionsRecorded: false,
        proposals: {
          create: args.proposals.map((pair, rank) => ({
            id: randomUUID(),
            bookmarkId: pair.bookmarkId,
            tagId: pair.tagId,
            kind: pair.suggestion.kind,
            swapTagId: pair.suggestion.kind === "swap" ? pair.suggestion.tagId : null,
            reason: pair.reason,
            currentScore: pair.currentScore,
            checked: true,
            rank,
          })),
        },
      },
    });
  });
}

function tagNameFromSuggestion(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.tags)) return null;
  const first = value.tags[0];
  if (!isRecord(first) || typeof first.name !== "string") return null;
  return first.name;
}

async function recordAppliedRejections(args: {
  userId: string;
  auditId: string;
  appliedAt: Date | null;
  items: Array<{
    bookmarkId: string;
    tagId: string;
    reason: string;
    currentScore: number;
  }>;
}): Promise<number> {
  const tags =
    args.items.length === 0
      ? []
      : await prisma.tag.findMany({
          where: {
            userId: args.userId,
            id: { in: [...new Set(args.items.map((item) => item.tagId))] },
          },
          select: { id: true, name: true, color: true },
        });
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const seen = new Set<string>();
  if (args.appliedAt && args.items.length > 0) {
    const existing = await prisma.orbitDecisionEvent.findMany({
      where: {
        userId: args.userId,
        action: "rejected",
        source: TAG_AUDIT_SOURCE,
        createdAt: { gte: args.appliedAt },
        bookmarkId: { in: [...new Set(args.items.map((item) => item.bookmarkId))] },
      },
      select: { bookmarkId: true, originalSuggestion: true },
    });
    for (const event of existing) {
      const name = tagNameFromSuggestion(event.originalSuggestion);
      if (!name) continue;
      seen.add(`${event.bookmarkId}\u0000${name}`);
    }
  }

  const events: OrbitDecisionEventPayload[] = [];
  for (const item of args.items) {
    const tag = tagById.get(item.tagId);
    if (!tag || !canRecordRejectionName(tag.name)) continue;
    const name = tag.name.trim();
    if (seen.has(`${item.bookmarkId}\u0000${name}`)) continue;
    events.push(
      buildTagAuditRejection({
        bookmarkId: item.bookmarkId,
        tagName: name,
        tagColor: tag.color,
        reason: item.reason,
        currentScore: item.currentScore,
      }),
    );
  }

  const result =
    events.length === 0
      ? { count: 0 }
      : await recordOrbitDecisionEvents({ userId: args.userId, events });
  await prisma.orbitTagAudit.update({
    where: { id: args.auditId },
    data: { rejectionsRecorded: true },
  });
  return result.count;
}

function rejectionItems(audit: ParsedAudit, appliedIds: readonly string[]) {
  const wanted = new Set(appliedIds);
  return audit.proposals
    .filter((proposal) => wanted.has(proposal.id))
    .sort((left, right) => left.rank - right.rank)
    .map((proposal) => ({
      bookmarkId: proposal.bookmarkId,
      tagId: proposal.tagId,
      reason: proposal.reason,
      currentScore: proposal.currentScore,
    }));
}

function applyResultFromOutcome(
  audit: ParsedAudit,
  rejectionsRecorded: number,
  alreadyApplied: boolean,
): TagAuditApplyResult {
  return {
    auditId: audit.id,
    phase: "applied",
    appliedProposalIds: audit.outcome?.appliedProposalIds ?? [],
    skippedProposalIds: audit.outcome?.skippedProposalIds ?? [],
    rejectionsRecorded,
    alreadyApplied,
  };
}

export async function runOrbitTagAudit(args: {
  userId: string;
  outstandingUndo: OutstandingUndoChoice;
  deadlineMs: number;
}): Promise<TagAuditView> {
  if (args.outstandingUndo === "block") {
    const ready = await readyUndo(prisma, args.userId);
    if (ready) {
      throw new OrbitTagAuditError(
        "Undo is still available for the last tag audit.",
        409,
        "undo_outstanding",
      );
    }
  }

  const taggedWhere = { userId: args.userId, tags: { some: {} } };
  const [taggedBookmarkCount, rows, tagRows, previous] = await Promise.all([
    prisma.bookmark.count({ where: taggedWhere }),
    prisma.bookmark.findMany({
      where: taggedWhere,
      orderBy: [{ bookmarkedAt: "desc" }, { id: "desc" }],
      take: ORBIT_TAG_AUDIT_BOOKMARK_CAP,
      include: {
        ...orbitScanBookmarkInclude,
        tags: {
          select: {
            tagId: true,
            tag: { select: { id: true, name: true, color: true } },
          },
        },
      },
    }),
    prisma.tag.findMany({
      where: { userId: args.userId },
      select: { id: true, name: true, color: true },
    }),
    prisma.orbitTagAudit.findFirst({
      where: { userId: args.userId },
      orderBy: { createdAt: "desc" },
      select: { vetoedPairKeys: true },
    }),
  ]);

  const previousVetoes = previous
    ? parseStringList(previous.vetoedPairKeys, "Tag audit veto list")
    : [];

  let judgedBookmarkCount = 0;
  let proposals: FlaggedPair[] = [];
  let vetoedPairKeys: string[] = [];

  if (rows.length > 0) {
    requireApiKey("TYPESAFE_API_KEY");
    const examples = await loadOrbitLabelExamples({
      userId: args.userId,
      tagIds: tagRows.map((tag) => tag.id),
      collectionIds: [],
    });
    const library: LibraryTag[] = tagRows.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      examples: examples.tags.get(tag.id),
    }));
    const existingTags: OrbitTagContext[] = library.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      examples: tag.examples,
    }));
    const folded = rows.map((row) =>
      withOrbitFolderHints(row as TaggedBookmarkRow),
    );
    const learning = await getOrbitLearningHintsForScan({
      userId: args.userId,
      bookmarks: folded.map((bookmark) => ({
        id: bookmark.id,
        authorUsername: bookmark.authorUsername,
        tweetText: bookmark.tweetText,
        media: bookmark.media,
        urls: bookmark.urls,
        xMetadata: bookmark.xMetadata,
        xFolderHints: bookmark.xFolderHints,
      })),
    });
    const judged = await judgeSlice({
      rows: rows as TaggedBookmarkRow[],
      library,
      existingTags,
      learningByBookmark: new Map(learning.map((hint) => [hint.bookmarkId, hint])),
      stopAt: args.deadlineMs - ORBIT_TAG_AUDIT_GROK_TIMEOUT_MS,
    });
    judgedBookmarkCount = judged.judged;
    const ranked = rankFlaggedPairs(judged.flagged);
    const selected = selectPairsForGrok(ranked, new Set(previousVetoes));
    if (selected.length > 0) {
      const excerpts = new Map(
        folded.map((bookmark) => [
          bookmark.id,
          truncateText(bookmark.tweetText, EXCERPT_MAX) ?? "",
        ]),
      );
      const verdicts = await weighWithGrok(selected, excerpts);
      const merged = mergeOpinions(selected, verdicts);
      proposals = merged.proposals;
      vetoedPairKeys = merged.vetoedPairKeys;
    }
  }

  await persistOpenAudit({
    userId: args.userId,
    outstandingUndo: args.outstandingUndo,
    taggedBookmarkCount,
    judgedBookmarkCount,
    proposals,
    vetoedPairKeys,
  });

  const view = await readOrbitTagAudit({ userId: args.userId });
  if (!view) {
    throw new OrbitTagAuditError("Tag audit could not be read after it was saved.", 500, "closed");
  }
  return view;
}

export async function readOrbitTagAudit(args: {
  userId: string;
}): Promise<TagAuditView | null> {
  const row = await findAuditRow(prisma, args.userId);
  if (!row) return null;
  return viewFromAudit(args.userId, parseAuditRow(row));
}

export async function setOrbitTagAuditChecked(args: {
  userId: string;
  auditId: string;
  checkedProposalIds: readonly string[];
}): Promise<TagAuditView> {
  const row = await findAuditRow(prisma, args.userId, args.auditId);
  if (!row) {
    throw new OrbitTagAuditError("Tag audit was not found.", 404, "not_found");
  }
  const audit = parseAuditRow(row);
  if (audit.phase !== "open") {
    throw new OrbitTagAuditError("This tag audit is no longer open.", 409, "closed");
  }
  const flags = checkedFlags(
    audit.proposals.map((proposal) => proposal.id),
    args.checkedProposalIds,
  );
  await prisma.$transaction(async (tx) => {
    for (const [id, checked] of flags) {
      await tx.orbitTagAuditProposal.update({
        where: { id },
        data: { checked },
      });
    }
  });
  const next = await findAuditRow(prisma, args.userId, args.auditId);
  if (!next) {
    throw new OrbitTagAuditError("Tag audit was not found.", 404, "not_found");
  }
  return viewFromAudit(args.userId, parseAuditRow(next));
}

async function readJoins(
  db: Db,
  userId: string,
  bookmarkIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const joins = new Map<string, Set<string>>();
  for (const bookmarkId of bookmarkIds) joins.set(bookmarkId, new Set());
  if (bookmarkIds.length === 0) return joins;
  const rows = await db.bookmarkTag.findMany({
    where: {
      bookmarkId: { in: [...bookmarkIds] },
      bookmark: { userId },
    },
    select: { bookmarkId: true, tagId: true },
  });
  for (const row of rows) {
    const tags = joins.get(row.bookmarkId) ?? new Set<string>();
    tags.add(row.tagId);
    joins.set(row.bookmarkId, tags);
  }
  return joins;
}

export async function applyOrbitTagAudit(args: {
  userId: string;
  auditId: string;
  checkedProposalIds: readonly string[];
}): Promise<TagAuditApplyResult> {
  const planned = await prisma.$transaction(async (tx) => {
    await lockOrbitApply(tx, args.userId);
    const row = await findAuditRow(tx, args.userId, args.auditId);
    if (!row) {
      throw new OrbitTagAuditError("Tag audit was not found.", 404, "not_found");
    }
    const audit = parseAuditRow(row);
    if (audit.phase === "undone") {
      throw new OrbitTagAuditError("This tag audit is already undone.", 409, "closed");
    }
    if (audit.phase === "applied") {
      return { kind: "applied" as const, audit };
    }

    const flags = checkedFlags(
      audit.proposals.map((proposal) => proposal.id),
      args.checkedProposalIds,
    );
    for (const [id, checked] of flags) {
      await tx.orbitTagAuditProposal.update({
        where: { id },
        data: { checked },
      });
    }
    const proposals = audit.proposals.map((proposal) => ({
      ...proposal,
      checked: flags.get(proposal.id) ?? false,
    }));
    const bookmarkIds = [...new Set(proposals.map((proposal) => proposal.bookmarkId))];
    const referencedTagIds = new Set<string>();
    for (const proposal of proposals) {
      if (!proposal.checked) continue;
      referencedTagIds.add(proposal.tagId);
      if (proposal.suggestion.kind === "swap") {
        referencedTagIds.add(proposal.suggestion.tagId);
      }
    }
    const [joinsByBookmark, liveTags] = await Promise.all([
      readJoins(tx, args.userId, bookmarkIds),
      referencedTagIds.size === 0
        ? []
        : tx.tag.findMany({
            where: { userId: args.userId, id: { in: [...referencedTagIds] } },
            select: { id: true },
          }),
    ]);
    const plan = compileJoinDelta({
      proposals,
      joinsByBookmark,
      liveTagIds: new Set(liveTags.map((tag) => tag.id)),
    });
    if (plan.appliedProposalIds.length === 0) {
      return {
        kind: "open" as const,
        auditId: audit.id,
        skippedProposalIds: plan.skippedProposalIds,
      };
    }

    const snapshot = snapshotTagSets(plan.touchedBookmarkIds, joinsByBookmark);
    const appliedAt = new Date();
    await tx.orbitTagAuditUndo.create({
      data: {
        auditId: audit.id,
        userId: args.userId,
        joins: snapshot,
      },
    });
    if (plan.deletes.length > 0) {
      await tx.bookmarkTag.deleteMany({
        where: {
          OR: plan.deletes.map((pair) => ({
            bookmarkId: pair.bookmarkId,
            tagId: pair.tagId,
          })),
        },
      });
    }
    if (plan.inserts.length > 0) {
      await tx.bookmarkTag.createMany({
        data: plan.inserts,
        skipDuplicates: true,
      });
    }
    const outcome: ApplyOutcome = {
      appliedProposalIds: plan.appliedProposalIds,
      skippedProposalIds: plan.skippedProposalIds,
    };
    await tx.orbitTagAudit.update({
      where: { id: audit.id },
      data: {
        phase: "applied",
        appliedAt,
        outcome,
      },
    });
    return {
      kind: "wrote" as const,
      audit,
      outcome,
      appliedAt,
    };
  });

  if (planned.kind === "open") {
    return {
      auditId: planned.auditId,
      phase: "open",
      appliedProposalIds: [],
      skippedProposalIds: planned.skippedProposalIds,
      rejectionsRecorded: 0,
      alreadyApplied: false,
    };
  }

  if (planned.kind === "applied") {
    if (planned.audit.rejectionsRecorded) {
      return applyResultFromOutcome(planned.audit, 0, true);
    }
    const count = await recordAppliedRejections({
      userId: args.userId,
      auditId: planned.audit.id,
      appliedAt: planned.audit.appliedAt,
      items: rejectionItems(
        planned.audit,
        planned.audit.outcome?.appliedProposalIds ?? [],
      ),
    });
    return applyResultFromOutcome(planned.audit, count, true);
  }

  const count = await recordAppliedRejections({
    userId: args.userId,
    auditId: planned.audit.id,
    appliedAt: planned.appliedAt,
    items: rejectionItems(planned.audit, planned.outcome.appliedProposalIds),
  });
  return {
    auditId: planned.audit.id,
    phase: "applied",
    appliedProposalIds: planned.outcome.appliedProposalIds,
    skippedProposalIds: planned.outcome.skippedProposalIds,
    rejectionsRecorded: count,
    alreadyApplied: false,
  };
}

export async function undoOrbitTagAudit(args: {
  userId: string;
  auditId: string;
}): Promise<TagAuditUndoResult> {
  return prisma.$transaction(async (tx) => {
    await lockOrbitApply(tx, args.userId);
    const row = await findAuditRow(tx, args.userId, args.auditId);
    if (!row) {
      throw new OrbitTagAuditError("Tag audit was not found.", 404, "not_found");
    }
    const audit = parseAuditRow(row);
    if (audit.undo?.restoredAt) {
      return {
        auditId: audit.id,
        restoredBookmarkIds: audit.undo.joins.map((join) => join.bookmarkId),
        alreadyUndone: true,
      };
    }
    if (!audit.undo || audit.phase !== "applied" || audit.undo.releasedAt) {
      throw new OrbitTagAuditError(
        "This tag audit cannot be undone.",
        409,
        "undo_unavailable",
      );
    }

    const neededTagIds = [
      ...new Set(audit.undo.joins.flatMap((join) => join.tagIds)),
    ];
    if (neededTagIds.length > 0) {
      const liveTags = await tx.tag.findMany({
        where: { userId: args.userId, id: { in: neededTagIds } },
        select: { id: true },
      });
      if (liveTags.length !== neededTagIds.length) {
        throw new OrbitTagAuditError(
          "A tag from the undo snapshot no longer exists.",
          409,
          "undo_tag_missing",
        );
      }
    }

    const snapshotIds = audit.undo.joins.map((join) => join.bookmarkId);
    const liveBookmarks =
      snapshotIds.length === 0
        ? []
        : await tx.bookmark.findMany({
            where: { userId: args.userId, id: { in: snapshotIds } },
            select: { id: true },
          });
    const liveIds = new Set(liveBookmarks.map((bookmark) => bookmark.id));
    const remaining = audit.undo.joins.filter((join) => liveIds.has(join.bookmarkId));
    if (remaining.length > 0) {
      await tx.bookmarkTag.deleteMany({
        where: { bookmarkId: { in: remaining.map((join) => join.bookmarkId) } },
      });
      const data = remaining.flatMap((join) =>
        join.tagIds.map((tagId) => ({ bookmarkId: join.bookmarkId, tagId })),
      );
      if (data.length > 0) {
        await tx.bookmarkTag.createMany({ data, skipDuplicates: true });
      }
    }
    await tx.orbitTagAuditUndo.update({
      where: { auditId: audit.id },
      data: { restoredAt: new Date() },
    });
    await tx.orbitTagAudit.update({
      where: { id: audit.id },
      data: { phase: "undone", outcome: Prisma.DbNull },
    });
    return {
      auditId: audit.id,
      restoredBookmarkIds: remaining.map((join) => join.bookmarkId),
      alreadyUndone: false,
    };
  });
}
