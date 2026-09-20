import "server-only";

import {
  ORBIT_LIBRARY_CLASSIFY_MAX_PAGES,
  ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE,
  ORBIT_LIBRARY_CLASSIFY_PAGES_PER_INVOCATION,
} from "@/lib/orbit-config";
import { getAuthorPriorHintsForScan } from "@/lib/orbit-author-history";
import { getOrbitLearningHintsForScan } from "@/lib/orbit-decision-events";
import { isSafeAutoApplySuggestion } from "@/lib/orbit-decision";
import { applyOrbitScanPlan, OrbitGrokError } from "@/lib/orbit-grok";
import { normalizeOrbitScanPlan } from "@/lib/orbit-grok-parse";
import {
  assignOrbitBookmarksWithJev,
  batchVocabularyFromPool,
  jevAssignmentsToRawPlan,
} from "@/lib/orbit-jev-assign";
import { refineOrbitJevLeftovers } from "@/lib/orbit-hybrid-scan";
import {
  buildSeedOrbitLabelPool,
  labelPoolFromAppliedNames,
  mergeOrbitLabelPool,
} from "@/lib/orbit-label-pool";
import type { OrbitLabelPool } from "@/lib/orbit-jev-assign";
import {
  orbitScanBookmarkInclude,
  withOrbitFolderHints,
} from "@/lib/orbit-scan-bookmarks";
import { getOrbitNeighborHintsForScan } from "@/lib/orbit-scan-neighbors";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { isTypeSafeConfigured } from "@/lib/typesafe";
import { invalidateUserResponseCache } from "@/lib/upstash-cache";
import type { OrbitApplyResult, OrbitLibraryClassifyResult } from "@/types";

export type OrbitLibraryClassifyCursor = {
  bookmarkedAt: string;
  id: string;
};

const untaggedOrbitWhere = (userId: string, cursor?: OrbitLibraryClassifyCursor) => ({
  userId,
  tags: { none: {} },
  collectionItems: {
    none: { collection: { type: "user_collection" as const } },
  },
  ...(cursor
    ? {
        OR: [
          { bookmarkedAt: { lt: new Date(cursor.bookmarkedAt) } },
          {
            bookmarkedAt: new Date(cursor.bookmarkedAt),
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
      .filter(isSafeAutoApplySuggestion)
      .map((suggestion) => ({
        ...suggestion,
        tags: suggestion.tags.filter((tag) => tag.reuseExisting),
        collection:
          suggestion.collection?.reuseExisting ? suggestion.collection : null,
      }))
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

export async function kickOrbitLibraryClassifyWorker(args: {
  userId: string;
  cursor?: OrbitLibraryClassifyCursor | null;
  pagesLeft?: number;
}) {
  const secret = process.env.SYNC_WORKER_SECRET?.trim();
  const pagesLeft = args.pagesLeft ?? ORBIT_LIBRARY_CLASSIFY_MAX_PAGES - 1;
  if (pagesLeft <= 0) return;

  const body = {
    userId: args.userId,
    cursor: args.cursor ?? undefined,
    pagesLeft,
  };

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SYNC_WORKER_SECRET is required in production to continue library classify."
      );
    }
    await classifyOrbitLibraryRun({
      userId: args.userId,
      cursor: args.cursor ?? undefined,
      continueInBackground: true,
      pagesLeft,
    });
    return;
  }

  try {
    const response = await fetch(
      `${getAppBaseUrl()}/api/internal/orbit/library-classify`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!response.ok && response.status !== 0) {
      logError(
        "OrbitLibrary",
        `Library classify dispatch failed (${response.status}) for ${args.userId}`
      );
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return;
    }
    logError("OrbitLibrary", "Library classify dispatch error", error);
  }
}

export async function countOrbitLibraryQueue(userId: string) {
  return prisma.bookmark.count({
    where: untaggedOrbitWhere(userId),
  });
}

export async function classifyOrbitLibraryRun(args: {
  userId: string;
  cursor?: OrbitLibraryClassifyCursor;
  continueInBackground?: boolean;
  pagesLeft?: number;
}): Promise<OrbitLibraryClassifyResult> {
  let cursor = args.cursor;
  let processed = 0;
  let applied = 0;
  let skippedReview = 0;
  let remaining = 0;
  let queueCount: number | undefined;
  let lastCursor = cursor;
  let warmPool: OrbitLabelPool | undefined;
  let pagesLeft = args.pagesLeft ?? ORBIT_LIBRARY_CLASSIFY_MAX_PAGES;
  const pagesToRun = Math.min(
    ORBIT_LIBRARY_CLASSIFY_PAGES_PER_INVOCATION,
    Math.max(0, pagesLeft)
  );

  for (let page = 0; page < pagesToRun; page += 1) {
    const result = await classifyOrbitLibraryPage({
      userId: args.userId,
      cursor,
      continueInBackground: false,
      pagesLeft: pagesLeft - 1,
      warmPool,
    });
    warmPool = result.warmPool ?? warmPool;
    processed += result.processed;
    applied += result.applied;
    skippedReview += result.skippedReview;
    remaining = result.remaining;
    queueCount ??= result.queueCount;
    lastCursor = result.cursor;
    cursor = result.cursor;
    pagesLeft -= 1;
    if (result.processed === 0 || remaining === 0 || pagesLeft <= 0) {
      break;
    }
  }

  const continued = remaining > 0 && pagesLeft > 0;
  if (args.continueInBackground && continued && lastCursor) {
    await kickOrbitLibraryClassifyWorker({
      userId: args.userId,
      cursor: lastCursor,
      pagesLeft,
    });
  }

  return {
    processed,
    applied,
    skippedReview,
    remaining,
    continued,
    queueCount,
    pagesLeft,
    cursor: lastCursor,
  };
}

export async function classifyOrbitLibraryPage(args: {
  userId: string;
  cursor?: OrbitLibraryClassifyCursor;
  continueInBackground?: boolean;
  pagesLeft?: number;
  warmPool?: OrbitLabelPool;
}): Promise<OrbitLibraryClassifyResult & { warmPool?: OrbitLabelPool }> {
  if (!isTypeSafeConfigured()) {
    throw new OrbitGrokError(
      "Set TYPESAFE_API_KEY before classifying the Orbit library.",
      503,
      "typesafe_auth"
    );
  }

  const [bookmarks, tags, collections, remainingAfterPage] = await Promise.all([
    prisma.bookmark.findMany({
      where: untaggedOrbitWhere(args.userId, args.cursor),
      include: orbitScanBookmarkInclude,
      orderBy: [{ bookmarkedAt: "desc" }, { id: "desc" }],
      take: ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE,
    }),
    prisma.tag.findMany({
      where: { userId: args.userId },
      select: {
        id: true,
        name: true,
        color: true,
        _count: { select: { bookmarks: true } },
      },
      orderBy: { bookmarks: { _count: "desc" } },
    }),
    prisma.collection.findMany({
      where: { userId: args.userId, type: "user_collection" },
      select: {
        id: true,
        name: true,
        description: true,
        _count: { select: { items: true } },
      },
      orderBy: { items: { _count: "desc" } },
    }),
    prisma.bookmark.count({
      where: untaggedOrbitWhere(args.userId, args.cursor),
    }),
  ]);

  if (bookmarks.length === 0) {
    return {
      processed: 0,
      applied: 0,
      skippedReview: 0,
      remaining: 0,
      continued: false,
      queueCount: 0,
    };
  }

  const bookmarksWithFolderHints = bookmarks.map(withOrbitFolderHints);
  const existingTags = tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    bookmarkCount: tag._count.bookmarks,
  }));
  const existingCollections = collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    bookmarkCount: collection._count.items,
  }));

  const [authorPriorHints, learningHints, neighborHints] = await Promise.all([
    getAuthorPriorHintsForScan(
      args.userId,
      bookmarksWithFolderHints.map((bookmark) => bookmark.authorUsername)
    ),
    getOrbitLearningHintsForScan({
      userId: args.userId,
      bookmarks: bookmarksWithFolderHints,
    }),
    getOrbitNeighborHintsForScan({
      userId: args.userId,
      bookmarks: bookmarksWithFolderHints,
    }),
  ]);

  const seed = buildSeedOrbitLabelPool({
    bookmarks: bookmarksWithFolderHints,
    existingTags,
    existingCollections,
    authorPriorHints,
    learningHints,
    neighborHints,
  });
  // Warm-pool names were applied on earlier pages of this run, so they are
  // genuinely existing labels — merge without the proposed-name cap and prefer
  // them in the first-pass shortlist.
  const pool = args.warmPool
    ? mergeOrbitLabelPool(seed, args.warmPool, { asProposed: false })
    : seed;

  const firstPass = await assignOrbitBookmarksWithJev({
    bookmarks: bookmarksWithFolderHints,
    existingTags,
    existingCollections,
    pool,
    authorPriorHints,
    learningHints,
    neighborHints,
    batchVocabulary: args.warmPool
      ? batchVocabularyFromPool(args.warmPool)
      : undefined,
  });
  const { assignments } = await refineOrbitJevLeftovers({
    bookmarks: bookmarksWithFolderHints,
    assignments: firstPass,
    pool,
    existingTags,
    existingCollections,
    authorPriorHints,
    learningHints,
    neighborHints,
  });

  const plan = normalizeOrbitScanPlan(jevAssignmentsToRawPlan(assignments), {
    bookmarkIds: bookmarks.map((bookmark) => bookmark.id),
    existingTags,
    existingCollections,
  });
  const safePlan = filterSafeLibraryClassifyPlan(plan);
  const skippedReview = plan.suggestions.length - safePlan.suggestions.length;

  let appliedResult: OrbitApplyResult | null = null;
  if (safePlan.suggestions.length > 0) {
    appliedResult = await applyOrbitScanPlan({
      userId: args.userId,
      plan: safePlan,
      createCollections: false,
    });
    await invalidateUserResponseCache(args.userId);
  }

  const last = bookmarks[bookmarks.length - 1]!;
  const cursor: OrbitLibraryClassifyCursor = {
    bookmarkedAt:
      last.bookmarkedAt instanceof Date
        ? last.bookmarkedAt.toISOString()
        : String(last.bookmarkedAt),
    id: last.id,
  };
  const remaining = Math.max(0, remainingAfterPage - bookmarks.length);
  const pagesLeft = args.pagesLeft ?? ORBIT_LIBRARY_CLASSIFY_MAX_PAGES - 1;
  const continued = remaining > 0 && pagesLeft > 0;

  if (args.continueInBackground && continued) {
    await kickOrbitLibraryClassifyWorker({
      userId: args.userId,
      cursor,
      pagesLeft: pagesLeft - 1,
    });
  }

  return {
    processed: bookmarks.length,
    applied: safePlan.suggestions.length,
    skippedReview,
    remaining,
    continued,
    queueCount: remainingAfterPage,
    cursor,
    appliedResult,
    warmPool: mergeOrbitLabelPool(
      args.warmPool ?? { tags: [], collections: [] },
      labelPoolFromAppliedNames({
        tags: safePlan.suggestions.flatMap((suggestion) =>
          suggestion.tags.map((tag) => tag.name)
        ),
        collections: safePlan.suggestions.flatMap((suggestion) =>
          suggestion.collection
            ? [
                {
                  name: suggestion.collection.name,
                  description: suggestion.collection.description,
                },
              ]
            : []
        ),
      }),
      { asProposed: false }
    ),
  };
}
