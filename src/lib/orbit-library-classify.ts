import "server-only";

import {
  ORBIT_LIBRARY_CLASSIFY_MAX_PAGES,
  ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE,
  ORBIT_LIBRARY_CLASSIFY_PAGES_PER_INVOCATION,
} from "@/lib/orbit-config";
import { isSafeAutoApplySuggestion } from "@/lib/orbit-decision";
import { isVideoFormatTag } from "@/lib/orbit-video-tag";
import { applyOrbitScanPlan, OrbitScanError } from "@/lib/orbit-grok";
import { planLibraryAssignments } from "@/lib/orbit-library-assign";
import { ensureLibraryVocabulary } from "@/lib/orbit-library-vocabulary";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { isTypeSafeConfigured } from "@/lib/typesafe";
import { invalidateUserResponseCache } from "@/lib/upstash-cache";
import type { OrbitLibraryClassifyResult } from "@/types";

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
  if (!isTypeSafeConfigured()) {
    throw new OrbitScanError(
      "Set TYPESAFE_API_KEY before tagging the library.",
      503,
      "typesafe_auth"
    );
  }

  const vocabulary = await ensureLibraryVocabulary(args.userId);
  let cursor = args.cursor;
  let processed = 0;
  let applied = 0;
  let skippedReview = 0;
  let remaining = 0;
  let queueCount: number | undefined;
  let lastCursor = cursor;
  let remainingEstimate: number | undefined;
  let pagesLeft = args.pagesLeft ?? ORBIT_LIBRARY_CLASSIFY_MAX_PAGES;
  const pagesToRun = Math.min(
    ORBIT_LIBRARY_CLASSIFY_PAGES_PER_INVOCATION,
    Math.max(0, pagesLeft)
  );

  if (vocabulary.length === 0) {
    return {
      processed: 0,
      applied: 0,
      skippedReview: 0,
      remaining: 0,
      continued: false,
      queueCount: 0,
      pagesLeft,
    };
  }

  for (let page = 0; page < pagesToRun; page += 1) {
    const result = await indexUntaggedLibraryPage({
      userId: args.userId,
      cursor,
      vocabulary,
      pagesLeft: pagesLeft - 1,
      remainingEstimate,
    });
    remainingEstimate = result.remaining;
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

export async function indexUntaggedLibraryPage(args: {
  userId: string;
  vocabulary: Array<{ name: string; color: string }>;
  cursor?: OrbitLibraryClassifyCursor;
  pagesLeft?: number;
  remainingEstimate?: number;
}): Promise<OrbitLibraryClassifyResult> {
  const [bookmarks, remainingAfterPage] = await Promise.all([
    prisma.bookmark.findMany({
      where: untaggedOrbitWhere(args.userId, args.cursor),
      select: {
        id: true,
        tweetText: true,
        media: true,
        xMetadata: true,
        bookmarkedAt: true,
      },
      orderBy: [{ bookmarkedAt: "desc" }, { id: "desc" }],
      take: ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE,
    }),
    args.remainingEstimate != null
      ? Promise.resolve(args.remainingEstimate)
      : prisma.bookmark.count({
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
      queueCount: remainingAfterPage,
    };
  }

  const plan = await planLibraryAssignments({
    bookmarks,
    vocabulary: args.vocabulary,
  });
  if (plan.suggestions.length > 0) {
    await applyOrbitScanPlan({
      userId: args.userId,
      plan,
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

  return {
    processed: bookmarks.length,
    applied: plan.suggestions.length,
    skippedReview: bookmarks.length - plan.suggestions.length,
    remaining,
    continued: remaining > 0 && pagesLeft > 0,
    queueCount: remainingAfterPage,
    cursor,
    pagesLeft,
  };
}
