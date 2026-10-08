import "server-only";

import { Prisma, type OrbitLibraryRun } from "@prisma/client";

import {
  ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE,
  ORBIT_LIBRARY_INVOCATION_BUDGET_MS,
  ORBIT_LIBRARY_LOOKAHEAD_BUDGET_MS,
  ORBIT_LIBRARY_PACK_SIZE,
  ORBIT_LIBRARY_RUN_RESUME_WINDOW_MS,
  ORBIT_LIBRARY_RUN_STALE_MS,
  ORBIT_LIBRARY_RUN_VISIBLE_AFTER_MS,
} from "@/lib/orbit-config";
import { isSafeAutoApplySuggestion } from "@/lib/orbit-decision";
import { chunkDecisionEvents } from "@/lib/orbit-decision-event-batch";
import { recordOrbitDecisionEvents } from "@/lib/orbit-decision-events";
import { isVideoFormatTag } from "@/lib/orbit-video-tag";
import { applyOrbitScanPlan, OrbitScanError } from "@/lib/orbit-grok";
import {
  buildLibraryAutoTagEvents,
  createPackLimiter,
  planLibraryAssignments,
  type LibraryAssignmentPlan,
  type LibraryTagExamples,
  type LibraryVocabularyTag,
  type PackLimiter,
} from "@/lib/orbit-library-assign";
import { loadOrbitTagExamplesByName } from "@/lib/orbit-label-examples";
import {
  ensureLibraryVocabulary,
  requestLibraryGrowthTags,
} from "@/lib/orbit-library-vocabulary";
import { logError, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { isTypeSafeConfigured } from "@/lib/typesafe";
import { invalidateUserResponseCache } from "@/lib/upstash-cache";
import type { OrbitLibraryRunView } from "@/types";

export type OrbitLibraryClassifyCursor = {
  bookmarkedAt: Date;
  id: string;
};

const untaggedOrbitWhere = (
  userId: string,
  cursor?: OrbitLibraryClassifyCursor | null
) => ({
  userId,
  tags: { none: {} },
  collectionItems: {
    none: { collection: { type: "user_collection" as const } },
  },
  ...(cursor
    ? {
        OR: [
          { bookmarkedAt: { lt: cursor.bookmarkedAt } },
          {
            bookmarkedAt: cursor.bookmarkedAt,
            id: { lt: cursor.id },
          },
        ],
      }
    : {}),
});

export function filterSafeLibraryClassifyPlan<
  T extends {
    suggestions: Array<{
      bookmarkId: string;
      confidence: "high" | "medium" | "low";
      reasoning: string;
      tags: Array<{
        name: string;
        color: string;
        reason: string;
        reuseExisting: boolean;
      }>;
      collection: {
        name: string;
        description: string;
        reason: string;
        reuseExisting: boolean;
      } | null;
    }>;
  },
>(plan: T) {
  return {
    ...plan,
    suggestions: plan.suggestions
      .map((suggestion) => {
        const safe = isSafeAutoApplySuggestion(suggestion);
        return {
          ...suggestion,
          tags: suggestion.tags.filter(
            (tag) => isVideoFormatTag(tag) || (safe && tag.reuseExisting)
          ),
          collection:
            safe && suggestion.collection?.reuseExisting
              ? suggestion.collection
              : null,
        };
      })
      .filter(
        (suggestion) => suggestion.tags.length > 0 || suggestion.collection
      ),
  };
}

function getAppBaseUrl() {
  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();
  if (nextAuthUrl) return nextAuthUrl.replace(/\/$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;
  return "http://localhost:3000";
}

export async function countOrbitLibraryQueue(userId: string) {
  return prisma.bookmark.count({
    where: untaggedOrbitWhere(userId),
  });
}

// ── Run records ─────────────────────────────────────────────────────────────

function parseVocabulary(value: unknown): LibraryVocabularyTag[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const { name, color } = entry as { name?: unknown; color?: unknown };
    return typeof name === "string" && typeof color === "string"
      ? [{ name, color }]
      : [];
  });
}

export function isOrbitLibraryRunStale(
  run: Pick<OrbitLibraryRun, "status" | "updatedAt">,
  now = Date.now()
) {
  return (
    run.status === "RUNNING" &&
    now - run.updatedAt.getTime() > ORBIT_LIBRARY_RUN_STALE_MS
  );
}

function endedAt(run: Pick<OrbitLibraryRun, "completedAt" | "updatedAt">) {
  return (run.completedAt ?? run.updatedAt).getTime();
}

/** A run that stopped without finishing: its worker died, or it failed recently. */
export function isOrbitLibraryRunResumable(
  run: Pick<OrbitLibraryRun, "status" | "updatedAt" | "completedAt">,
  now = Date.now()
) {
  if (run.status === "RUNNING") return isOrbitLibraryRunStale(run, now);
  return (
    run.status === "FAILED" &&
    now - endedAt(run) <= ORBIT_LIBRARY_RUN_RESUME_WINDOW_MS
  );
}

export function toOrbitLibraryRunView(
  run: OrbitLibraryRun,
  now = Date.now()
): OrbitLibraryRunView {
  return {
    id: run.id,
    status: run.status.toLowerCase() as OrbitLibraryRunView["status"],
    total: run.total,
    processed: run.processed,
    applied: run.applied,
    failed: run.failed,
    vocabulary: parseVocabulary(run.vocabulary),
    round: run.round,
    newTags: parseVocabulary(run.growthVocabulary),
    priorRoundApplied: run.priorRoundApplied,
    roundStartedAt: (run.roundStartedAt ?? run.startedAt).toISOString(),
    errorMessage: run.errorMessage,
    startedAt: run.startedAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    stalled: isOrbitLibraryRunStale(run, now),
  };
}

/**
 * The run Orbit should show: an active one, a failed one that can still
 * resume, or one that ended moments ago so a polling client sees how it ended.
 */
export async function getLatestOrbitLibraryRun(userId: string, now = Date.now()) {
  const run = await prisma.orbitLibraryRun.findFirst({
    where: { userId },
    orderBy: { startedAt: "desc" },
  });
  if (!run || run.status === "RUNNING") return run;
  if (isOrbitLibraryRunResumable(run, now)) return run;
  return now - endedAt(run) <= ORBIT_LIBRARY_RUN_VISIBLE_AFTER_MS ? run : null;
}

function requireTypeSafe() {
  if (!isTypeSafeConfigured()) {
    throw new OrbitScanError(
      "Set TYPESAFE_API_KEY before tagging the library.",
      503,
      "typesafe_auth"
    );
  }
}

/** Opens a pass over the current Orbit queue. Null when nothing is untagged. */
export async function createOrbitLibraryRun(userId: string) {
  requireTypeSafe();

  const [total, tagCount] = await Promise.all([
    countOrbitLibraryQueue(userId),
    prisma.tag.count({ where: { userId } }),
  ]);
  if (total === 0) return null;
  if (tagCount === 0 && !process.env.XAI_API_KEY?.trim()) {
    // With no tags yet, Grok names the first tag list from a sample.
    throw new OrbitScanError(
      "Set XAI_API_KEY so Grok can name tags for an untagged library.",
      503,
      "xai_auth"
    );
  }

  return prisma.orbitLibraryRun.create({ data: { userId, total } });
}

/**
 * Picks a stalled or failed run back up from its cursor, keeping its counts
 * and tag list, so already-checked bookmarks aren't paid for twice.
 */
export function resumeOrbitLibraryRun(runId: string) {
  requireTypeSafe();
  // The write bumps updatedAt, so the run reads as live again immediately.
  return prisma.orbitLibraryRun.update({
    where: { id: runId },
    data: { status: "RUNNING", errorMessage: null, completedAt: null },
  });
}

/** Stops a running pass, or dismisses a failed one so it no longer offers Resume. */
export async function cancelOrbitLibraryRun(userId: string) {
  await prisma.orbitLibraryRun.updateMany({
    where: { userId, status: { in: ["RUNNING", "FAILED"] } },
    data: { status: "CANCELLED", completedAt: new Date() },
  });
  return getLatestOrbitLibraryRun(userId);
}

// ── Worker ──────────────────────────────────────────────────────────────────

export type OrbitLibraryPageResult = {
  processed: number;
  applied: number;
  failed: number;
  cursor: OrbitLibraryClassifyCursor | null;
};

/** Untagged bookmarks after the cursor, newest first. */
function fetchUntaggedLibraryPage(
  userId: string,
  cursor: OrbitLibraryClassifyCursor | null
) {
  return prisma.bookmark.findMany({
    where: untaggedOrbitWhere(userId, cursor),
    select: {
      id: true,
      tweetText: true,
      media: true,
      urls: true,
      xMetadata: true,
      bookmarkedAt: true,
    },
    orderBy: [{ bookmarkedAt: "desc" }, { id: "desc" }],
    take: ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE,
  });
}

type LibraryPageBookmark = Awaited<
  ReturnType<typeof fetchUntaggedLibraryPage>
>[number];

function cursorAfter(bookmarks: LibraryPageBookmark[]): OrbitLibraryClassifyCursor {
  const last = bookmarks[bookmarks.length - 1]!;
  return { bookmarkedAt: last.bookmarkedAt, id: last.id };
}

/** Asks Jev about one page against the closed tag list. Applies nothing. */
async function planUntaggedLibraryPage(
  bookmarks: LibraryPageBookmark[],
  vocabulary: LibraryVocabularyTag[],
  limiter: PackLimiter,
  signal: AbortSignal,
  examples: LibraryTagExamples
) {
  const planned = await planLibraryAssignments({
    bookmarks,
    vocabulary,
    limiter,
    examples,
    signal,
  });
  // Several packs failing with none succeeding means TypeSafe is down, not
  // that the posts fit nothing. Stop instead of skipping the rest of the queue.
  if (
    planned.modelChecked > ORBIT_LIBRARY_PACK_SIZE &&
    planned.failed === planned.modelChecked
  ) {
    throw new OrbitScanError(
      "TypeSafe could not be reached.",
      503,
      "typesafe_unavailable"
    );
  }
  return planned;
}

async function recordAutoTagEvents(
  userId: string,
  planned: Pick<LibraryAssignmentPlan, "plan" | "scores">
) {
  try {
    const events = buildLibraryAutoTagEvents({
      suggestions: planned.plan.suggestions,
      scores: planned.scores ?? new Map(),
    });
    if (events.length === 0) return;
    for (const batch of chunkDecisionEvents(events)) {
      await recordOrbitDecisionEvents({ userId, events: batch });
    }
  } catch (error) {
    logWarn(
      "OrbitLibrary",
      "Auto-tag decision log failed; the page still applied.",
      error instanceof Error ? error.message : error
    );
  }
}

/** Applies one planned page. Pages are applied strictly in queue order. */
async function applyUntaggedLibraryPage(
  userId: string,
  bookmarks: LibraryPageBookmark[],
  planned: LibraryAssignmentPlan
): Promise<OrbitLibraryPageResult> {
  const { plan, failed } = planned;
  if (plan.suggestions.length > 0) {
    await applyOrbitScanPlan({ userId, plan, createCollections: false });
    await invalidateUserResponseCache(userId);
  }
  await recordAutoTagEvents(userId, planned);
  return {
    processed: bookmarks.length,
    applied: plan.suggestions.length,
    failed,
    cursor: cursorAfter(bookmarks),
  };
}

type LibraryPageWork = {
  bookmarks: Promise<LibraryPageBookmark[]>;
  planned: Promise<LibraryAssignmentPlan>;
};

/** Writes one page of progress. False when the run was stopped meanwhile. */
async function recordPage(runId: string, page: OrbitLibraryPageResult) {
  const { count } = await prisma.orbitLibraryRun.updateMany({
    where: { id: runId, status: "RUNNING" },
    data: {
      processed: { increment: page.processed },
      applied: { increment: page.applied },
      failed: { increment: page.failed },
      cursorBookmarkedAt: page.cursor?.bookmarkedAt ?? null,
      cursorId: page.cursor?.id ?? null,
      updatedAt: new Date(),
    },
  });
  return count > 0;
}

async function finishRun(
  runId: string,
  status: "COMPLETED" | "FAILED",
  errorMessage: string | null = null
) {
  const now = new Date();
  await prisma.orbitLibraryRun.updateMany({
    where: { id: runId, status: "RUNNING" },
    data: { status, errorMessage, completedAt: now, updatedAt: now },
  });
}

function libraryGrowthEnabled() {
  const value = process.env.ORBIT_LIBRARY_GROWTH?.trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "off";
}

/**
 * The pass over the closed list reached the end of the queue. With Grok
 * available, the run takes one more round: the next slice names new tags for
 * the posts nothing fit and judges only those posts against them. Otherwise,
 * or after that round, the run is done.
 */
async function finishPass(
  run: Pick<OrbitLibraryRun, "id" | "round">
): Promise<{ continued: boolean }> {
  if (
    run.round !== 0 ||
    !libraryGrowthEnabled() ||
    !process.env.XAI_API_KEY?.trim()
  ) {
    await finishRun(run.id, "COMPLETED");
    return { continued: false };
  }
  const { count } = await prisma.orbitLibraryRun.updateMany({
    where: { id: run.id, status: "RUNNING" },
    data: {
      round: 1,
      growthVocabulary: Prisma.DbNull,
      cursorBookmarkedAt: null,
      cursorId: null,
      updatedAt: new Date(),
    },
  });
  return { continued: count > 0 };
}

/**
 * Round 1's new tags, named once and stored on the run. An empty list ends
 * the run: round 0's counts stand. Naming is best-effort — a Grok failure
 * finishes the run as completed rather than failing work already applied.
 */
async function ensureGrowthVocabulary(
  run: OrbitLibraryRun,
  vocabulary: LibraryVocabularyTag[]
): Promise<LibraryVocabularyTag[] | null> {
  const stored = parseVocabulary(run.growthVocabulary);
  if (stored) return stored;

  let growth: LibraryVocabularyTag[] = [];
  try {
    growth = await requestLibraryGrowthTags(run.userId, vocabulary);
  } catch (error) {
    logWarn(
      "OrbitLibrary",
      `Could not name new tags for run ${run.id}; finishing without a second round.`,
      error instanceof Error ? error.message : error
    );
  }
  if (growth.length === 0) {
    await finishRun(run.id, "COMPLETED");
    return null;
  }

  const remaining = await countOrbitLibraryQueue(run.userId);
  const now = new Date();
  const { count } = await prisma.orbitLibraryRun.updateMany({
    where: { id: run.id, status: "RUNNING" },
    data: {
      growthVocabulary: growth.map(({ name, color }) => ({ name, color })),
      vocabulary: [...vocabulary, ...growth].map(({ name, color }) => ({ name, color })),
      // Progress restarts for the round. `applied` keeps counting, and so
      // does `failed`: posts whose round-0 call failed were never checked
      // against the original list, so they still need a later run.
      total: remaining,
      processed: 0,
      priorRoundApplied: run.applied,
      roundStartedAt: now,
      updatedAt: now,
    },
  });
  return count > 0 ? growth : null;
}

/**
 * One budgeted slice of a run: resolve the tag list once, then tag pages until
 * the queue ends, the run is stopped, or the time budget is spent.
 *
 * Pages overlap: once a page's bookmarks are known, the following page is
 * fetched and its packs queue on the same Jev slots, filling the ones this
 * page's slowest packs leave idle (about a third faster end to end). Results
 * are still applied and recorded one page at a time, in order.
 */
export async function runOrbitLibraryInvocation(
  runId: string,
  now: () => number = Date.now
): Promise<{ continued: boolean }> {
  const startedAt = now();
  const run = await prisma.orbitLibraryRun.findUnique({ where: { id: runId } });
  if (!run || run.status !== "RUNNING") return { continued: false };

  const limiter = createPackLimiter();
  // Stops the queued packs of a look-ahead page this slice won't apply.
  const abandon = new AbortController();
  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => {
    deadline.abort();
  }, ORBIT_LIBRARY_INVOCATION_BUDGET_MS);

  try {
    if (run.round === 1 && !libraryGrowthEnabled()) {
      await finishRun(run.id, "COMPLETED");
      return { continued: false };
    }

    let vocabulary = parseVocabulary(run.vocabulary);
    if (!vocabulary) {
      vocabulary = await ensureLibraryVocabulary(run.userId);
      if (vocabulary.length === 0) {
        await finishRun(run.id, "COMPLETED");
        return { continued: false };
      }
      const { count } = await prisma.orbitLibraryRun.updateMany({
        where: { id: run.id, status: "RUNNING" },
        data: {
          vocabulary: vocabulary.map(({ name, color }) => ({ name, color })),
          updatedAt: new Date(),
        },
      });
      if (count === 0) return { continued: false };
    }

    // Round 1 judges the posts round 0 left untagged against only the new
    // names: the old ones were already asked about each of them.
    let tagList = vocabulary;
    if (run.round === 1) {
      const growth = await ensureGrowthVocabulary(run, vocabulary);
      if (!growth) return { continued: false };
      tagList = growth;
    }

    const examples = await loadOrbitTagExamplesByName(
      run.userId,
      tagList.map((tag) => tag.name)
    );
    const cursor: OrbitLibraryClassifyCursor | null =
      run.cursorBookmarkedAt && run.cursorId
        ? { bookmarkedAt: run.cursorBookmarkedAt, id: run.cursorId }
        : null;
    let recordedPage = false;
    let startedPages = 0;
    const startPage = (pageCursor: OrbitLibraryClassifyCursor | null) => {
      startedPages += 1;
      const exemptFromDeadline = startedPages === 1;
      const signal = exemptFromDeadline
        ? abandon.signal
        : AbortSignal.any([abandon.signal, deadline.signal]);
      const bookmarks = fetchUntaggedLibraryPage(run.userId, pageCursor);
      const planned = bookmarks.then((rows) =>
        planUntaggedLibraryPage(rows, tagList, limiter, signal, examples)
      );
      // A look-ahead page can be abandoned (run stopped, earlier page
      // failed); its rejections must not surface as unhandled.
      bookmarks.catch(() => {});
      planned.catch(() => {});
      return { bookmarks, planned } satisfies LibraryPageWork;
    };
    const underBudget = (budgetMs: number) =>
      !deadline.signal.aborted && now() - startedAt < budgetMs;

    let current: LibraryPageWork | null = underBudget(
      ORBIT_LIBRARY_INVOCATION_BUDGET_MS
    )
      ? startPage(cursor)
      : null;

    while (current) {
      const bookmarks = await current.bookmarks;
      if (bookmarks.length === 0) return finishPass(run);
      const fullPage = bookmarks.length === ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE;
      let following =
        fullPage && underBudget(ORBIT_LIBRARY_LOOKAHEAD_BUDGET_MS)
          ? startPage(cursorAfter(bookmarks))
          : null;

      const planned = await current.planned;
      if (deadline.signal.aborted && recordedPage) {
        await prisma.orbitLibraryRun.updateMany({
          where: { id: run.id, status: "RUNNING" },
          data: { updatedAt: new Date() },
        });
        return { continued: true };
      }
      const page = await applyUntaggedLibraryPage(
        run.userId,
        bookmarks,
        planned
      );
      if (!(await recordPage(run.id, page))) return { continued: false };
      recordedPage = true;
      if (!fullPage) return finishPass(run);
      // Past the look-ahead budget, pages run one at a time until the slice ends.
      if (!following && underBudget(ORBIT_LIBRARY_INVOCATION_BUDGET_MS)) {
        following = startPage(cursorAfter(bookmarks));
      }
      current = following;
    }
    return { continued: true };
  } catch (error) {
    if (!(error instanceof OrbitScanError)) {
      logError("OrbitLibrary", `Library run ${run.id} failed`, error);
    }
    await finishRun(
      run.id,
      "FAILED",
      error instanceof OrbitScanError
        ? error.message
        : "Auto-tag stopped unexpectedly."
    );
    return { continued: false };
  } finally {
    clearTimeout(deadlineTimer);
    abandon.abort();
  }
}

async function dispatchOrbitLibraryWorker(runId: string, secret: string) {
  try {
    const response = await fetch(
      `${getAppBaseUrl()}/api/internal/orbit/library-classify`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ runId }),
        // The next slice runs for minutes; only wait long enough to hand off.
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!response.ok) {
      logError(
        "OrbitLibrary",
        `Library run dispatch failed (${response.status}) for ${runId}`
      );
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return;
    }
    // The run goes stale and the next start resumes it from its cursor.
    logError("OrbitLibrary", "Library run dispatch error", error);
  }
}

/**
 * Carries a run to the end. Local dev without a worker secret keeps going in
 * this process; otherwise each serverless call runs one budgeted slice and
 * hands the rest to a fresh invocation.
 */
export async function driveOrbitLibraryRun(runId: string) {
  const secret = process.env.SYNC_WORKER_SECRET?.trim();
  if (!secret && process.env.NODE_ENV !== "production") {
    let slice = await runOrbitLibraryInvocation(runId);
    while (slice.continued) slice = await runOrbitLibraryInvocation(runId);
    return;
  }

  const { continued } = await runOrbitLibraryInvocation(runId);
  if (!continued) return;
  if (!secret) {
    await finishRun(
      runId,
      "FAILED",
      "Auto-tag needs SYNC_WORKER_SECRET to keep going in the background."
    );
    return;
  }
  await dispatchOrbitLibraryWorker(runId, secret);
}
