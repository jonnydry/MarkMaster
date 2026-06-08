import "server-only";

import { getOrbitBookmarkSourceQuality } from "@/lib/orbit-batch-planner";
import { RateLimitError, refreshBookmarkDataByTweetIds } from "@/lib/x-api";
import { buildBookmarkUpdateData, updateBookmarksInBatches } from "@/lib/sync-utils";
import type { BookmarkWithRelations } from "@/types";

const STALE_SYNC_DAYS = 30;
const TWEET_TRUNCATION_THRESHOLD = 275;

export interface OrbitEnrichmentBookmark {
  id: string;
  tweetId: string;
  tweetText: string;
  authorUsername: string;
  authorDisplayName: string;
  authorVerified: boolean;
  publicMetrics: unknown;
  media: unknown;
  urls: unknown;
  quotedTweet: unknown;
  xMetadata?: unknown;
  tweetCreatedAt: Date | string;
  bookmarkedAt: Date | string;
  syncedAt: Date | string;
  notes: Array<{ id: string; content: string }>;
  xFolderHints?: Array<{ id?: string; name: string }>;
}

export interface OrbitScanEnrichmentResult {
  bookmarks: OrbitEnrichmentBookmark[];
  enrichment: {
    attempted: number;
    refreshed: number;
    skipped: number;
    failed?: number;
    reason?: "rate_limited" | "auth_error" | "none_needed" | "error";
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasNoteTweet(xMetadata: unknown) {
  if (!isObject(xMetadata)) return false;
  const tweet = xMetadata.tweet;
  if (!isObject(tweet)) return false;
  return isObject(tweet.note_tweet) && typeof tweet.note_tweet.text === "string";
}

function isStaleSyncedAt(syncedAt: Date | string) {
  const synced = new Date(syncedAt);
  if (Number.isNaN(synced.getTime())) return true;
  const ageMs = Date.now() - synced.getTime();
  return ageMs > STALE_SYNC_DAYS * 24 * 60 * 60 * 1000;
}

function isMissingEnrichmentMetadata(xMetadata: unknown) {
  if (!isObject(xMetadata)) return true;
  const tweet = xMetadata.tweet;
  const author = xMetadata.author;
  const hasTweetMetadata = isObject(tweet) && Object.keys(tweet).length > 0;
  const hasAuthorMetadata =
    isObject(author) && typeof author.description === "string";
  return !hasTweetMetadata && !hasAuthorMetadata;
}

function isTruncatedWithoutNoteTweet(bookmark: OrbitEnrichmentBookmark) {
  if (hasNoteTweet(bookmark.xMetadata)) return false;
  const text = bookmark.tweetText.trim();
  return (
    text.endsWith("…") ||
    text.length >= TWEET_TRUNCATION_THRESHOLD
  );
}

function toBookmarkWithRelations(
  bookmark: OrbitEnrichmentBookmark
): BookmarkWithRelations {
  return {
    id: bookmark.id,
    tweetId: bookmark.tweetId,
    authorId: "",
    authorUsername: bookmark.authorUsername,
    authorDisplayName: bookmark.authorDisplayName,
    authorProfileImage: null,
    authorVerified: bookmark.authorVerified,
    tweetText: bookmark.tweetText,
    publicMetrics:
      (bookmark.publicMetrics as BookmarkWithRelations["publicMetrics"]) ?? null,
    media: Array.isArray(bookmark.media)
      ? (bookmark.media as BookmarkWithRelations["media"])
      : null,
    urls: Array.isArray(bookmark.urls)
      ? (bookmark.urls as BookmarkWithRelations["urls"])
      : null,
    quotedTweet:
      (bookmark.quotedTweet as BookmarkWithRelations["quotedTweet"]) ?? null,
    xMetadata: isObject(bookmark.xMetadata)
      ? (bookmark.xMetadata as BookmarkWithRelations["xMetadata"])
      : null,
    tweetCreatedAt:
      typeof bookmark.tweetCreatedAt === "string"
        ? bookmark.tweetCreatedAt
        : bookmark.tweetCreatedAt.toISOString(),
    bookmarkedAt:
      typeof bookmark.bookmarkedAt === "string"
        ? bookmark.bookmarkedAt
        : bookmark.bookmarkedAt.toISOString(),
    tags: [],
    notes: bookmark.notes,
    collectionItems: (bookmark.xFolderHints ?? []).map((folder) => ({
      collection: {
        id: folder.id ?? folder.name,
        name: folder.name,
      },
    })),
  };
}

export function needsEnrichment(bookmark: OrbitEnrichmentBookmark): boolean {
  const quality = getOrbitBookmarkSourceQuality(toBookmarkWithRelations(bookmark));

  if (quality.usefulSignalCount === 0) return true;
  if (isStaleSyncedAt(bookmark.syncedAt) && isMissingEnrichmentMetadata(bookmark.xMetadata)) {
    return true;
  }
  if (isTruncatedWithoutNoteTweet(bookmark)) return true;

  return false;
}

function mergeRefreshedBookmark(
  original: OrbitEnrichmentBookmark,
  refreshed: OrbitEnrichmentBookmark
): OrbitEnrichmentBookmark {
  return {
    ...original,
    ...refreshed,
    id: original.id,
    notes: original.notes,
    xFolderHints: original.xFolderHints,
  };
}

function mapBookmarkDataToEnrichmentBookmark(
  bookmark: OrbitEnrichmentBookmark,
  data: Awaited<ReturnType<typeof refreshBookmarkDataByTweetIds>>["bookmarks"][number]
): OrbitEnrichmentBookmark {
  const updated = buildBookmarkUpdateData(data);
  return {
    ...bookmark,
    authorUsername: updated.authorUsername,
    authorDisplayName: updated.authorDisplayName,
    authorVerified: updated.authorVerified,
    tweetText: updated.tweetText,
    publicMetrics: updated.publicMetrics,
    media: updated.media,
    urls: updated.urls,
    quotedTweet: updated.quotedTweet,
    xMetadata:
      updated.xMetadata &&
      typeof updated.xMetadata === "object" &&
      !("json" in (updated.xMetadata as object))
        ? (updated.xMetadata as OrbitEnrichmentBookmark["xMetadata"])
        : undefined,
    tweetCreatedAt: updated.tweetCreatedAt,
    syncedAt: updated.syncedAt,
  };
}

export async function enrichBookmarksForScan(
  userId: string,
  bookmarks: OrbitEnrichmentBookmark[]
): Promise<OrbitScanEnrichmentResult> {
  const candidates = bookmarks.filter(needsEnrichment);
  if (candidates.length === 0) {
    return {
      bookmarks,
      enrichment: {
        attempted: 0,
        refreshed: 0,
        skipped: bookmarks.length,
        reason: "none_needed",
      },
    };
  }

  try {
    const tweetIds = candidates.map((bookmark) => bookmark.tweetId);
    const refreshed = await refreshBookmarkDataByTweetIds(userId, tweetIds);
    const refreshedByTweetId = new Map(
      refreshed.bookmarks.map((entry) => [entry.tweet.id, entry])
    );

    const updateEntries = candidates.flatMap((bookmark) => {
      const data = refreshedByTweetId.get(bookmark.tweetId);
      return data ? [{ tweetId: bookmark.tweetId, data }] : [];
    });

    const updatedCount = await updateBookmarksInBatches(userId, updateEntries);

    const mergedBookmarks = bookmarks.map((bookmark) => {
      const data = refreshedByTweetId.get(bookmark.tweetId);
      if (!data) return bookmark;
      return mergeRefreshedBookmark(
        bookmark,
        mapBookmarkDataToEnrichmentBookmark(bookmark, data)
      );
    });

    return {
      bookmarks: mergedBookmarks,
      enrichment: {
        attempted: candidates.length,
        refreshed: updatedCount,
        skipped: bookmarks.length - candidates.length,
      },
    };
  } catch (error) {
    const reason =
      error instanceof RateLimitError
        ? "rate_limited"
        : error instanceof Error &&
            /(?:\b401\b|\b403\b|auth|unauthorized|forbidden|token)/i.test(
              error.message
            )
          ? "auth_error"
          : "error";

    return {
      bookmarks,
      enrichment: {
        attempted: candidates.length,
        refreshed: 0,
        skipped: bookmarks.length - candidates.length,
        failed: candidates.length,
        reason,
      },
    };
  }
}