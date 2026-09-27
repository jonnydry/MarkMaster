import "server-only";

import type { OrbitLibraryRun } from "@prisma/client";

import {
  ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE,
  ORBIT_LIBRARY_INVOCATION_BUDGET_MS,
  ORBIT_LIBRARY_PACK_SIZE,
  ORBIT_LIBRARY_RUN_RESUME_WINDOW_MS,
  ORBIT_LIBRARY_RUN_STALE_MS,
  ORBIT_LIBRARY_RUN_VISIBLE_AFTER_MS,
} from "@/lib/orbit-config";
import { isSafeAutoApplySuggestion } from "@/lib/orbit-decision";
import { isVideoFormatTag } from "@/lib/orbit-video-tag";
import { applyOrbitScanPlan, OrbitScanError } from "@/lib/orbit-grok";
import {
  planLibraryAssignments,
  type LibraryVocabularyTag,
} from "@/lib/orbit-library-assign";
import { ensureLibraryVocabulary } from "@/lib/orbit-library-vocabulary";
import { logError } from "@/lib/logger";
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

/** Tags one page of untagged bookmarks after the cursor from the closed tag list. */
async function tagUntaggedLibraryPage(args: {
  userId: string;
  vocabulary: LibraryVocabularyTag[];
  cursor: OrbitLibraryClassifyCursor | null;
}): Promise<OrbitLibraryPageResult> {
  const bookmarks = await prisma.bookmark.findMany({
    where: untaggedOrbitWhere(args.userId, args.cursor),
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

  if (bookmarks.length === 0) {
    return { processed: 0, applied: 0, failed: 0, cursor: args.cursor };
  }

  const { plan, modelChecked, failed } = await planLibraryAssignments({
    bookmarks,
    vocabulary: args.vocabulary,
  });
  // Several packs failing with none succeeding means TypeSafe is down, not
  // that the posts fit nothing. Stop instead of skipping the rest of the queue.
  if (modelChecked > ORBIT_LIBRARY_PACK_SIZE && failed === modelChecked) {
    throw new OrbitScanError(
      "TypeSafe could not be reached.",
      503,
      "typesafe_unavailable"
    );
  }

  if (plan.suggestions.length > 0) {
    await applyOrbitScanPlan({
      userId: args.userId,
      plan,
      createCollections: false,
    });
    await invalidateUserResponseCache(args.userId);
  }

  const last = bookmarks[bookmarks.length - 1]!;
  return {
    processed: bookmarks.length,
    applied: plan.suggestions.length,
    failed,
    cursor: { bookmarkedAt: last.bookmarkedAt, id: last.id },
  };
}

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

/**
 * One budgeted slice of a run: resolve the tag list once, then tag pages until
 * the queue ends, the run is stopped, or the time budget is spent.
 */
export async function runOrbitLibraryInvocation(
  runId: string,
  now: () => number = Date.now
): Promise<{ continued: boolean }> {
  const startedAt = now();
  const run = await prisma.orbitLibraryRun.findUnique({ where: { id: runId } });
  if (!run || run.status !== "RUNNING") return { continued: false };

  try {
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

    let cursor: OrbitLibraryClassifyCursor | null =
      run.cursorBookmarkedAt && run.cursorId
        ? { bookmarkedAt: run.cursorBookmarkedAt, id: run.cursorId }
        : null;

    while (now() - startedAt < ORBIT_LIBRARY_INVOCATION_BUDGET_MS) {
      const page = await tagUntaggedLibraryPage({
        userId: run.userId,
        vocabulary,
        cursor,
      });
      if (page.processed === 0) {
        await finishRun(run.id, "COMPLETED");
        return { continued: false };
      }
      if (!(await recordPage(run.id, page))) return { continued: false };
      if (page.processed < ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE) {
        await finishRun(run.id, "COMPLETED");
        return { continued: false };
      }
      cursor = page.cursor;
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
