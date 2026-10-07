import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";
import { noul } from "@typesafe-ai/sdk";

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
import { throwMappedXaiHttpError } from "@/lib/orbit-grok";
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
  toJsonState,
  type OrbitLabelPoolItem,
} from "@/lib/orbit-jev-assign";
import { loadOrbitLabelExamples } from "@/lib/orbit-label-examples";
import { prisma } from "@/lib/prisma";
import {
  orbitScanBookmarkInclude,
  withOrbitFolderHints,
} from "@/lib/orbit-scan-bookmarks";
import { TYPESAFE_TIMEOUT_MS, getTypeSafeClient, getTypeSafeModel } from "@/lib/typesafe";
import type { OrbitDecisionEventPayload } from "@/types";

export const ORBIT_TAG_AUDIT_GROK_CAP = 24;

export const ORBIT_TAG_AUDIT_BOOKMARK_CAP = 80;

export const ORBIT_TAG_AUDIT_CLASH_MARGIN = 0.2;

export const ORBIT_TAG_AUDIT_RIVAL_CAP = 8;

/**
 * Grok cap for this audit. maxDuration is 240s and the route keeps a 20s
 * margin, so work must finish by 220s. Scheduling stops one Jev attempt
 * (15s) plus this cap before that deadline: 145s of new calls, 15s for a
 * late attempt, 60s of Grok, then the 20s margin.
 */
export const ORBIT_TAG_AUDIT_GROK_TIMEOUT_MS = 60_000;

export function tagAuditGrokTimeoutMs(deadlineMs: number, now = Date.now()): number {
  return Math.max(0, Math.min(ORBIT_TAG_AUDIT_GROK_TIMEOUT_MS, deadlineMs - now));
}

export function tagAuditJevStopAt(deadlineMs: number): number {
  return deadlineMs - ORBIT_TAG_AUDIT_GROK_TIMEOUT_MS - TYPESAFE_TIMEOUT_MS;
}

const TAG_AUDIT_TX_OPTIONS = { maxWait: 5_000, timeout: 15_000 } as const;

export function tagAuditUndoLabel(
  appliedAt: Date | null,
  changeCount: number,
  now = Date.now(),
): string {
  const changes = changeCount === 1 ? "1 change" : `${changeCount} changes`;
  return `Undo review from ${undoAge(appliedAt, now)} (${changes})`;
}

function undoAge(appliedAt: Date | null, now: number): string {
  if (!appliedAt) return "earlier";
  const minutes = Math.floor(Math.max(0, now - appliedAt.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

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
};

export type TagAuditCoverage = {
  taggedBookmarkCount: number;
  judgedBookmarkCount: number;
  bookmarkCap: number;
  resumed?: boolean;
  wrapped?: boolean;
  skippedBookmarkCount?: number;
};

export type TagAuditPhase = "open" | "applied" | "undone";

export type TagAuditView = {
  auditId: string;
  phase: TagAuditPhase;
  coverage: TagAuditCoverage;
  /** True when some applied audit still has an unrestored undo. */
  undoAvailable: boolean;
  /** Applied audit whose undo is still available. Null when undo is not. */
  undoAuditId: string | null;
  undoLabel: string | null;
  proposals: TagAuditProposalView[];
};

export type TagAuditApplyResult = {
  auditId: string;
  phase: "open" | "applied";
  appliedProposalIds: string[];
  skippedProposalIds: string[];
  alreadyApplied: boolean;
};

export type TagAuditUndoResult = {
  auditId: string;
  restoredBookmarkIds: string[];
  alreadyUndone: boolean;
};

export class OrbitTagAuditError extends Error {
  readonly status: number;
  readonly code: "not_configured" | "not_found" | "closed" | "undo_unavailable";

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
  rank: number;
};

type UndoDelta = {
  removes: PairRef[];
  adds: PairRef[];
};

type ParsedUndo = {
  delta: UndoDelta | null;
  restoredAt: string | null;
};

type SliceMark = "scored" | "failed" | "pending";

type AuditPage = {
  endBookmarkedAt: string;
  endBookmarkId: string;
  resumed: boolean;
  wrapped: boolean;
  failedIds: string[];
  skippedBookmarkCount: number;
};

type ParsedAudit = {
  id: string;
  phase: TagAuditPhase;
  taggedBookmarkCount: number;
  judgedBookmarkCount: number;
  outcome: ApplyOutcome | null;
  page: AuditPage | null;
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
  outcome: unknown;
  appliedAt: Date | null;
  undo: {
    joins: unknown;
    restoredAt: Date | null;
  } | null;
  proposals: Array<{
    id: string;
    bookmarkId: string;
    tagId: string;
    kind: string;
    swapTagId: string | null;
    reason: string;
    currentScore: number;
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
  let sentence: string;
  if (coverage.taggedBookmarkCount === 0) {
    sentence = "No tagged bookmarks.";
  } else {
    const targeted = Math.min(coverage.taggedBookmarkCount, coverage.bookmarkCap);
    if (coverage.judgedBookmarkCount === 0) {
      sentence = "Jev couldn't be reached.";
    } else if (coverage.judgedBookmarkCount < targeted) {
      sentence = `Reviewed ${coverage.judgedBookmarkCount} of ${coverage.taggedBookmarkCount} tagged bookmarks.`;
    } else if (coverage.taggedBookmarkCount <= coverage.bookmarkCap) {
      sentence = `Reviewed all ${coverage.taggedBookmarkCount} tagged bookmarks.`;
    } else if (coverage.wrapped) {
      sentence = `Reviewed ${coverage.bookmarkCap} tagged bookmarks, wrapping back to the newest.`;
    } else if (coverage.resumed) {
      sentence = `Reviewed ${coverage.bookmarkCap} tagged bookmarks, continuing past the previous review.`;
    } else {
      sentence = `Reviewed the newest ${coverage.bookmarkCap} of ${coverage.taggedBookmarkCount} tagged bookmarks.`;
    }
  }
  const skipped = coverage.skippedBookmarkCount ?? 0;
  if (skipped <= 0) return sentence;
  return `${sentence} ${skipped} skipped after repeated failures.`;
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

function selectPairsForGrok(ranked: readonly FlaggedPair[]): FlaggedPair[] {
  return ranked.slice(0, ORBIT_TAG_AUDIT_GROK_CAP);
}

function mergeOpinions(
  sent: readonly FlaggedPair[],
  verdicts: ReadonlyMap<string, { agree: boolean; reason: string }>,
): FlaggedPair[] {
  const proposals: FlaggedPair[] = [];
  for (const pair of sent) {
    const verdict = verdicts.get(pair.pairKey);
    if (!verdict?.agree) continue;
    const reason = oneLineReason(verdict.reason, pair.reason);
    proposals.push(reason === pair.reason ? pair : { ...pair, reason });
  }
  return proposals;
}

function checkedIdsFor(
  proposalIds: readonly string[],
  checkedProposalIds: readonly string[],
): Set<string> {
  assertCheckedIds(proposalIds, checkedProposalIds);
  return new Set(checkedProposalIds);
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
  checkedIds: ReadonlySet<string>;
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
    if (!args.checkedIds.has(proposal.id)) continue;
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

function buildTagAuditRejection(args: {
  auditId: string;
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
      auditId: args.auditId,
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
  const list = isRecord(raw) && Array.isArray(raw.verdicts) ? raw.verdicts : [];
  const verdicts = new Map<string, { agree: boolean; reason: string }>();
  for (const item of list) {
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

function suggestionFromRow(
  kind: string,
  swapTagId: string | null,
): ParsedProposal["suggestion"] | null {
  if (kind === "remove") return { kind: "remove" };
  if (kind === "swap" && swapTagId) return { kind: "swap", tagId: swapTagId };
  return null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function readUndoPairs(value: unknown): PairRef[] {
  if (!Array.isArray(value)) {
    throw new OrbitTagAuditError("Tag audit undo data is unreadable.", 500, "closed");
  }
  const pairs: PairRef[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.bookmarkId !== "string" || typeof item.tagId !== "string") {
      throw new OrbitTagAuditError("Tag audit undo data is unreadable.", 500, "closed");
    }
    pairs.push({ bookmarkId: item.bookmarkId, tagId: item.tagId });
  }
  return pairs;
}

function readUndoDelta(value: unknown): UndoDelta {
  if (!isRecord(value)) {
    throw new OrbitTagAuditError("Tag audit undo data is unreadable.", 500, "closed");
  }
  return { removes: readUndoPairs(value.removes), adds: readUndoPairs(value.adds) };
}

function readUndoDeltaOrNull(value: unknown): UndoDelta | null {
  try {
    return readUndoDelta(value);
  } catch (error) {
    if (error instanceof OrbitTagAuditError) return null;
    throw error;
  }
}

function readOutcome(value: unknown): ApplyOutcome | null {
  if (!isRecord(value)) return null;
  return {
    appliedProposalIds: stringList(value.appliedProposalIds),
    skippedProposalIds: stringList(value.skippedProposalIds),
  };
}

function readPage(value: unknown): AuditPage | null {
  if (!isRecord(value) || !isRecord(value.page)) return null;
  const page = value.page;
  const failedIds = stringList(page.failedIds);
  const endBookmarkedAt = typeof page.endBookmarkedAt === "string" ? page.endBookmarkedAt : "";
  const endBookmarkId = typeof page.endBookmarkId === "string" ? page.endBookmarkId : "";
  if (!endBookmarkId && failedIds.length === 0) return null;
  const skippedBookmarkCount = page.skippedBookmarkCount;
  return {
    endBookmarkedAt,
    endBookmarkId,
    resumed: page.resumed === true,
    wrapped: page.wrapped === true,
    failedIds,
    skippedBookmarkCount:
      typeof skippedBookmarkCount === "number" && skippedBookmarkCount > 0
        ? skippedBookmarkCount
        : 0,
  };
}

function parsePhase(phase: string): TagAuditPhase {
  if (phase === "open" || phase === "applied" || phase === "undone") return phase;
  throw new OrbitTagAuditError("Tag audit phase is not recognized.", 500, "closed");
}

function parseAuditRow(row: AuditRow): ParsedAudit {
  const proposals: ParsedProposal[] = [];
  for (const proposal of row.proposals) {
    const suggestion = suggestionFromRow(proposal.kind, proposal.swapTagId);
    if (!suggestion) continue;
    proposals.push({
      id: proposal.id,
      bookmarkId: proposal.bookmarkId,
      tagId: proposal.tagId,
      suggestion,
      reason: proposal.reason,
      currentScore: proposal.currentScore,
      rank: proposal.rank,
    });
  }
  return {
    id: row.id,
    phase: parsePhase(row.phase),
    taggedBookmarkCount: row.taggedBookmarkCount,
    judgedBookmarkCount: row.judgedBookmarkCount,
    outcome: readOutcome(row.outcome),
    page: readPage(row.outcome),
    appliedAt: row.appliedAt,
    undo: row.undo
      ? {
          delta: readUndoDeltaOrNull(row.undo.joins),
          restoredAt: row.undo.restoredAt?.toISOString() ?? null,
        }
      : null,
    proposals,
  };
}

function undoAvailable(audit: ParsedAudit): boolean {
  return audit.phase === "applied" && audit.undo !== null && audit.undo.restoredAt === null;
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
    });
  }

  const undoId = undoAvailable(audit) ? audit.id : null;
  return {
    auditId: audit.id,
    phase: audit.phase,
    undoAvailable: undoId !== null,
    undoAuditId: undoId,
    undoLabel: null,
    coverage: {
      taggedBookmarkCount: audit.taggedBookmarkCount,
      judgedBookmarkCount: audit.judgedBookmarkCount,
      bookmarkCap: ORBIT_TAG_AUDIT_BOOKMARK_CAP,
      resumed: audit.page?.resumed ?? false,
      wrapped: audit.page?.wrapped ?? false,
      skippedBookmarkCount: audit.page?.skippedBookmarkCount ?? 0,
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
}): Promise<{ ok: true; pairs: FlaggedPair[] } | { ok: false }> {
  const askable = args.current.filter((tag) => canRecordRejectionName(tag.name));
  if (askable.length === 0) return { ok: true, pairs: [] };

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
    return { ok: false };
  }

  const currentScores: ScoredLabel[] = [];
  for (const [index, tag] of askable.entries()) {
    const noulScore = readNoul(answers[`current_${index}`]);
    if (noulScore === null) return { ok: true, pairs: [] };
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
  return { ok: true, pairs: flagged };
}

async function weighWithGrok(
  pairs: readonly FlaggedPair[],
  excerpts: ReadonlyMap<string, string>,
  timeoutMs: number,
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
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new OrbitScanError(
      "xAI could not be reached. Try the scan again in a moment.",
      503,
      "xai_unavailable",
    );
  }

  if (!response.ok) {
    await throwMappedXaiHttpError(response);
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
  signal: AbortSignal;
}): Promise<{ flagged: FlaggedPair[]; judged: number; marks: SliceMark[] }> {
  const flagged: FlaggedPair[] = [];
  const marks = new Array<SliceMark>(args.rows.length).fill("pending");
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
      const scored = await scoreBookmark({
        bookmark,
        current: current.map((tag) => ({
          ...tag,
          examples: args.library.find((item) => item.id === tag.id)?.examples,
        })),
        rivals,
        payload,
        signal: args.signal,
      });
      if (!scored.ok) {
        marks[index] = "failed";
        continue;
      }
      marks[index] = "scored";
      flagged.push(...scored.pairs);
      judged += 1;
    }
  }

  const workers = Math.min(ORBIT_JEV_ASSIGN_CONCURRENCY, args.rows.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return { flagged, judged, marks };
}

async function persistOpenAudit(args: {
  userId: string;
  taggedBookmarkCount: number;
  judgedBookmarkCount: number;
  proposals: readonly FlaggedPair[];
  page: AuditPage | null;
}) {
  const save = () =>
    prisma.$transaction(async (tx) => {
      await lockOrbitApply(tx, args.userId);
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
          outcome: args.page ? { page: args.page } : undefined,
          proposals: {
            create: args.proposals.map((pair, rank) => ({
              id: randomUUID(),
              bookmarkId: pair.bookmarkId,
              tagId: pair.tagId,
              kind: pair.suggestion.kind,
              swapTagId: pair.suggestion.kind === "swap" ? pair.suggestion.tagId : null,
              reason: pair.reason,
              currentScore: pair.currentScore,
              rank,
            })),
          },
        },
      });
    });
  try {
    await save();
  } catch (error) {
    if (!isRecord(error) || error.code !== "P2028") throw error;
    await save();
  }
}

async function writeAppliedRejections(
  db: Db,
  args: {
    userId: string;
    auditId: string;
    proposals: readonly ParsedProposal[];
    appliedIds: readonly string[];
  },
) {
  const wanted = new Set(args.appliedIds);
  const items = args.proposals.filter((proposal) => wanted.has(proposal.id));
  const tags =
    items.length === 0
      ? []
      : await db.tag.findMany({
          where: {
            userId: args.userId,
            id: { in: [...new Set(items.map((item) => item.tagId))] },
          },
          select: { id: true, name: true, color: true },
        });
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const events: OrbitDecisionEventPayload[] = [];
  for (const item of items) {
    const tag = tagById.get(item.tagId);
    if (!tag || !canRecordRejectionName(tag.name)) continue;
    events.push(
      buildTagAuditRejection({
        auditId: args.auditId,
        bookmarkId: item.bookmarkId,
        tagName: tag.name.trim(),
        tagColor: tag.color,
        reason: item.reason,
        currentScore: item.currentScore,
      }),
    );
  }
  if (events.length === 0) return;
  await recordOrbitDecisionEvents({ userId: args.userId, events, db });
}

const bookmarkOrder = [{ bookmarkedAt: "desc" as const }, { id: "desc" as const }];

function taggedBookmarkInclude() {
  return {
    ...orbitScanBookmarkInclude,
    tags: {
      select: {
        tagId: true,
        tag: { select: { id: true, name: true, color: true } },
      },
    },
  };
}

function pageFromMarks(
  rows: readonly TaggedBookmarkRow[],
  marks: readonly SliceMark[],
  previous: AuditPage | null,
  resumed: boolean,
  wrapped: boolean,
): AuditPage | null {
  const previousFailed = new Set(previous?.failedIds ?? []);
  const anyScored = marks.some((mark) => mark === "scored");
  const failedIds = anyScored
    ? rows.flatMap((row, index) => (marks[index] === "failed" ? [row.id] : []))
    : (previous?.failedIds ?? []);
  let prefix = 0;
  let skippedBookmarkCount = 0;
  while (prefix < rows.length) {
    const mark = marks[prefix];
    const row = rows[prefix];
    const repeatedFailure =
      anyScored && mark === "failed" && row !== undefined && previousFailed.has(row.id);
    if (mark !== "scored" && !repeatedFailure) break;
    if (repeatedFailure) skippedBookmarkCount += 1;
    prefix += 1;
  }
  if (prefix <= 0) {
    if (failedIds.length === 0) return previous;
    return {
      endBookmarkedAt: previous?.endBookmarkedAt ?? "",
      endBookmarkId: previous?.endBookmarkId ?? "",
      resumed: previous?.resumed ?? resumed,
      wrapped: previous?.wrapped ?? wrapped,
      failedIds,
      skippedBookmarkCount: 0,
    };
  }
  const end = rows[prefix - 1];
  if (!end) return previous;
  const bookmarkedAt =
    end.bookmarkedAt instanceof Date ? end.bookmarkedAt : new Date(end.bookmarkedAt);
  return {
    endBookmarkedAt: bookmarkedAt.toISOString(),
    endBookmarkId: end.id,
    resumed,
    wrapped,
    failedIds,
    skippedBookmarkCount,
  };
}

async function selectTaggedBookmarks(userId: string, cursor: AuditPage | null) {
  const taggedWhere = { userId, tags: { some: {} } };
  const include = taggedBookmarkInclude();
  if (!cursor?.endBookmarkId) {
    const rows = await prisma.bookmark.findMany({
      where: taggedWhere,
      orderBy: bookmarkOrder,
      take: ORBIT_TAG_AUDIT_BOOKMARK_CAP,
      include,
    });
    return { rows: rows as TaggedBookmarkRow[], resumed: false, wrapped: false };
  }

  const endAt = new Date(cursor.endBookmarkedAt);
  const older = await prisma.bookmark.findMany({
    where: {
      ...taggedWhere,
      OR: [
        { bookmarkedAt: { lt: endAt } },
        { bookmarkedAt: endAt, id: { lt: cursor.endBookmarkId } },
      ],
    },
    orderBy: bookmarkOrder,
    take: ORBIT_TAG_AUDIT_BOOKMARK_CAP,
    include,
  });
  if (older.length >= ORBIT_TAG_AUDIT_BOOKMARK_CAP) {
    return { rows: older as TaggedBookmarkRow[], resumed: true, wrapped: false };
  }

  const fill = await prisma.bookmark.findMany({
    where: {
      ...taggedWhere,
      ...(older.length > 0 ? { id: { notIn: older.map((row) => row.id) } } : {}),
    },
    orderBy: bookmarkOrder,
    take: ORBIT_TAG_AUDIT_BOOKMARK_CAP - older.length,
    include,
  });
  return {
    rows: [...older, ...fill] as TaggedBookmarkRow[],
    resumed: true,
    wrapped: fill.length > 0,
  };
}

async function findUndoAudit(
  db: Db,
  userId: string,
): Promise<{ id: string; label: string } | null> {
  const row = await db.orbitTagAudit.findFirst({
    where: {
      userId,
      phase: "applied",
      undo: { is: { restoredAt: null } },
    },
    orderBy: { appliedAt: "desc" },
    include: { undo: true },
  });
  if (!row?.undo || row.undo.restoredAt) return null;
  const delta = readUndoDeltaOrNull(row.undo.joins);
  return {
    id: row.id,
    label: delta
      ? tagAuditUndoLabel(row.appliedAt, delta.removes.length + delta.adds.length)
      : "Undo",
  };
}

export async function runOrbitTagAudit(args: {
  userId: string;
  deadlineMs: number;
}): Promise<TagAuditView> {
  const taggedWhere = { userId: args.userId, tags: { some: {} } };
  const previous = await findAuditRow(prisma, args.userId);
  const cursor = readPage(previous?.outcome);
  const [taggedBookmarkCount, slice, tagRows] = await Promise.all([
    prisma.bookmark.count({ where: taggedWhere }),
    selectTaggedBookmarks(args.userId, cursor),
    prisma.tag.findMany({
      where: { userId: args.userId },
      select: { id: true, name: true, color: true },
    }),
  ]);
  const rows = slice.rows;

  let judgedBookmarkCount = 0;
  let proposals: FlaggedPair[] = [];
  let page: AuditPage | null = null;

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
    const stopAt = tagAuditJevStopAt(args.deadlineMs);
    const judged = await judgeSlice({
      rows: rows as TaggedBookmarkRow[],
      library,
      existingTags,
      learningByBookmark: new Map(learning.map((hint) => [hint.bookmarkId, hint])),
      stopAt,
      signal: AbortSignal.timeout(Math.max(0, stopAt - Date.now())),
    });
    judgedBookmarkCount = judged.judged;
    page = pageFromMarks(rows, judged.marks, cursor, slice.resumed, slice.wrapped);
    const selected = selectPairsForGrok(rankFlaggedPairs(judged.flagged));
    if (selected.length > 0) {
      const excerpts = new Map(
        folded.map((bookmark) => [
          bookmark.id,
          truncateText(bookmark.tweetText, EXCERPT_MAX) ?? "",
        ]),
      );
      proposals = mergeOpinions(
        selected,
        await weighWithGrok(selected, excerpts, tagAuditGrokTimeoutMs(args.deadlineMs)),
      );
    }
  }

  await persistOpenAudit({
    userId: args.userId,
    taggedBookmarkCount,
    judgedBookmarkCount,
    proposals,
    page,
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
  const [row, undoAudit] = await Promise.all([
    findAuditRow(prisma, args.userId),
    findUndoAudit(prisma, args.userId),
  ]);
  if (!row) return null;
  const view = await viewFromAudit(args.userId, parseAuditRow(row));
  return {
    ...view,
    undoAvailable: undoAudit !== null,
    undoAuditId: undoAudit?.id ?? null,
    undoLabel: undoAudit?.label ?? null,
  };
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
  return prisma.$transaction(async (tx) => {
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
      return {
        auditId: audit.id,
        phase: "applied" as const,
        appliedProposalIds: audit.outcome?.appliedProposalIds ?? [],
        skippedProposalIds: audit.outcome?.skippedProposalIds ?? [],
        alreadyApplied: true,
      };
    }

    const checkedIds = checkedIdsFor(
      audit.proposals.map((proposal) => proposal.id),
      args.checkedProposalIds,
    );
    const bookmarkIds = [...new Set(audit.proposals.map((proposal) => proposal.bookmarkId))];
    const referencedTagIds = new Set<string>();
    for (const proposal of audit.proposals) {
      if (!checkedIds.has(proposal.id)) continue;
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
      proposals: audit.proposals,
      checkedIds,
      joinsByBookmark,
      liveTagIds: new Set(liveTags.map((tag) => tag.id)),
    });
    if (plan.appliedProposalIds.length === 0) {
      return {
        auditId: audit.id,
        phase: "open" as const,
        appliedProposalIds: [],
        skippedProposalIds: plan.skippedProposalIds,
        alreadyApplied: false,
      };
    }

    const appliedAt = new Date();
    await tx.orbitTagAuditUndo.create({
      data: {
        auditId: audit.id,
        userId: args.userId,
        joins: { removes: plan.deletes, adds: plan.inserts },
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
    await tx.orbitTagAudit.update({
      where: { id: audit.id },
      data: {
        phase: "applied",
        appliedAt,
        outcome: {
          appliedProposalIds: plan.appliedProposalIds,
          skippedProposalIds: plan.skippedProposalIds,
          ...(audit.page ? { page: audit.page } : {}),
        },
      },
    });
    await writeAppliedRejections(tx, {
      userId: args.userId,
      auditId: audit.id,
      proposals: audit.proposals,
      appliedIds: plan.appliedProposalIds,
    });
    return {
      auditId: audit.id,
      phase: "applied" as const,
      appliedProposalIds: plan.appliedProposalIds,
      skippedProposalIds: plan.skippedProposalIds,
      alreadyApplied: false,
    };
  }, TAG_AUDIT_TX_OPTIONS);
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
      const restored = audit.undo.delta;
      const restoredBookmarkIds = restored
        ? [
            ...new Set([
              ...restored.removes.map((pair) => pair.bookmarkId),
              ...restored.adds.map((pair) => pair.bookmarkId),
            ]),
          ]
        : [];
      return {
        auditId: audit.id,
        restoredBookmarkIds,
        alreadyUndone: true,
      };
    }
    if (audit.phase === "applied" && audit.undo && !audit.undo.delta) {
      throw new OrbitTagAuditError("Tag audit undo data is unreadable.", 500, "closed");
    }
    if (!audit.undo?.delta || audit.phase !== "applied") {
      throw new OrbitTagAuditError(
        "This tag audit cannot be undone.",
        409,
        "undo_unavailable",
      );
    }
    const delta = audit.undo.delta;
    const bookmarkIds = [
      ...new Set([
        ...delta.removes.map((pair) => pair.bookmarkId),
        ...delta.adds.map((pair) => pair.bookmarkId),
      ]),
    ];

    const liveBookmarks =
      bookmarkIds.length === 0
        ? []
        : await tx.bookmark.findMany({
            where: { userId: args.userId, id: { in: bookmarkIds } },
            select: { id: true },
          });
    const liveBookmarkIds = new Set(liveBookmarks.map((bookmark) => bookmark.id));
    const removeTagIds = [...new Set(delta.removes.map((pair) => pair.tagId))];
    const liveTags =
      removeTagIds.length === 0
        ? []
        : await tx.tag.findMany({
            where: { userId: args.userId, id: { in: removeTagIds } },
            select: { id: true },
          });
    const liveTagIds = new Set(liveTags.map((tag) => tag.id));
    const drop = delta.adds.filter((pair) => liveBookmarkIds.has(pair.bookmarkId));
    const readd = delta.removes.filter(
      (pair) => liveBookmarkIds.has(pair.bookmarkId) && liveTagIds.has(pair.tagId),
    );
    if (drop.length > 0) {
      await tx.bookmarkTag.deleteMany({
        where: {
          OR: drop.map((pair) => ({
            bookmarkId: pair.bookmarkId,
            tagId: pair.tagId,
          })),
        },
      });
    }
    if (readd.length > 0) {
      await tx.bookmarkTag.createMany({ data: readd, skipDuplicates: true });
    }
    await tx.orbitDecisionEvent.deleteMany({
      where: {
        userId: args.userId,
        source: TAG_AUDIT_SOURCE,
        originalSuggestion: {
          path: ["auditId"],
          equals: audit.id,
        },
      },
    });
    await tx.orbitTagAuditUndo.update({
      where: { auditId: audit.id },
      data: { restoredAt: new Date() },
    });
    await tx.orbitTagAudit.update({
      where: { id: audit.id },
      data: {
        phase: "undone",
        outcome: audit.page ? { page: audit.page } : Prisma.DbNull,
      },
    });
    return {
      auditId: audit.id,
      restoredBookmarkIds: bookmarkIds.filter((bookmarkId) =>
        liveBookmarkIds.has(bookmarkId),
      ),
      alreadyUndone: false,
    };
  }, TAG_AUDIT_TX_OPTIONS);
}
