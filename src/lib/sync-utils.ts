import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import type { BookmarkData } from "./x-api";
import { mapStoredBookmarkMedia } from "./bookmark-media";

/** Keep serverless/Postgres poolers from getting a burst of hundreds of updates. */
export const BOOKMARK_UPDATE_BATCH_SIZE = 10;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildBookmarkUpdateData(data: BookmarkData) {
  return {
    tweetId: data.tweet.id,
    authorId: data.author.id,
    authorUsername: data.author.username,
    authorDisplayName: data.author.name,
    authorProfileImage: data.author.profile_image_url || null,
    authorVerified: data.author.verified || false,
    tweetText: data.tweet.text,
    publicMetrics: data.tweet.public_metrics ?? Prisma.JsonNull,
    media:
      data.media.length > 0
        ? mapStoredBookmarkMedia(data.media)
        : Prisma.JsonNull,
    urls: data.tweet.entities?.urls ?? Prisma.JsonNull,
    quotedTweet: data.quotedTweet
      ? {
          id: data.quotedTweet.id,
          text: data.quotedTweet.text,
          author: data.quotedTweet.author
            ? {
                name: data.quotedTweet.author.name,
                username: data.quotedTweet.author.username,
                profile_image_url: data.quotedTweet.author.profile_image_url,
              }
            : null,
        }
      : Prisma.JsonNull,
    tweetCreatedAt: new Date(data.tweet.created_at),
    syncedAt: new Date(),
  };
}

export type BookmarkSyncEntry = {
  tweetId: string;
  data: BookmarkData;
};

export async function updateBookmarksInBatches(
  userId: string,
  entries: BookmarkSyncEntry[]
) {
  let updated = 0;

  for (let i = 0; i < entries.length; i += BOOKMARK_UPDATE_BATCH_SIZE) {
    const batch = entries.slice(i, i + BOOKMARK_UPDATE_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((entry) => {
        const bookmarkData = buildBookmarkUpdateData(entry.data);
        return prisma.bookmark.updateMany({
          where: { userId, tweetId: entry.tweetId },
          data: bookmarkData,
        });
      })
    );

    updated += results.reduce((sum, result) => sum + result.count, 0);
  }

  return updated;
}

/**
 * Builds the exact payload object used when creating a new Bookmark.
 * This is the single source of truth to eliminate duplication between
 * the main pagination path and the folder sync path.
 */
export function buildBookmarkCreateData(userId: string, data: BookmarkData) {
  return {
    userId,
    tweetId: data.tweet.id,
    authorId: data.author.id,
    authorUsername: data.author.username,
    authorDisplayName: data.author.name,
    authorProfileImage: data.author.profile_image_url || null,
    authorVerified: data.author.verified || false,
    tweetText: data.tweet.text,
    publicMetrics: data.tweet.public_metrics ?? Prisma.JsonNull,
    media:
      data.media.length > 0
        ? mapStoredBookmarkMedia(data.media)
        : Prisma.JsonNull,
    urls: data.tweet.entities?.urls ?? Prisma.JsonNull,
    quotedTweet: data.quotedTweet
      ? {
          id: data.quotedTweet.id,
          text: data.quotedTweet.text,
          author: data.quotedTweet.author
            ? {
                name: data.quotedTweet.author.name,
                username: data.quotedTweet.author.username,
                profile_image_url: data.quotedTweet.author.profile_image_url,
              }
            : null,
        }
      : Prisma.JsonNull,
    tweetCreatedAt: new Date(data.tweet.created_at),
    syncedAt: new Date(),
  };
}

/**
 * Targeted existence query (replaces full preload).
 * Returns the set of tweetIds that already exist as Bookmarks for this user.
 */
export async function getExistingTweetIdsForUserAndTweets(
  userId: string,
  tweetIds: string[]
): Promise<Set<string>> {
  if (tweetIds.length === 0) return new Set();

  const DEBUG_RESUME = process.env.DEBUG_RESUME_TEST === '1';
  if (DEBUG_RESUME) {
    console.log("[SYNC-UTILS DEBUG] getExistingTweetIdsForUserAndTweets called", {
      userId,
      tweetIds,
    });
  }

  const rows = await prisma.bookmark.findMany({
    where: { userId, tweetId: { in: tweetIds } },
    select: { tweetId: true },
  });

  const result = new Set(rows.map((r) => r.tweetId));

  if (DEBUG_RESUME) {
    console.log("[SYNC-UTILS DEBUG] getExistingTweetIdsForUserAndTweets result", {
      userId,
      asked: tweetIds,
      returned: Array.from(result),
    });
  }

  return result;
}

/**
 * Targeted existence query (replaces full preload).
 * Returns the set of tweetIds that are hidden for this user.
 */
export async function getHiddenTweetIdsForUserAndTweets(
  userId: string,
  tweetIds: string[]
): Promise<Set<string>> {
  if (tweetIds.length === 0) return new Set();

  const rows = await prisma.hiddenBookmark.findMany({
    where: { userId, tweetId: { in: tweetIds } },
    select: { tweetId: true },
  });

  return new Set(rows.map((r) => r.tweetId));
}
