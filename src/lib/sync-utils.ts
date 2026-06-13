import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import type { BookmarkData } from "./x-api";
import { mapStoredBookmarkMedia } from "./bookmark-media";

/** Keep serverless/Postgres poolers from getting a burst of hundreds of updates. */
export const BOOKMARK_UPDATE_BATCH_SIZE = 10;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

function hasOwnData(value: Record<string, unknown>) {
  return Object.keys(value).length > 0;
}

export function buildBookmarkXMetadata(
  data: BookmarkData
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  const tweet: Record<string, unknown> = {};
  const author: Record<string, unknown> = {};

  if (data.tweet.lang) tweet.lang = data.tweet.lang;
  if (typeof data.tweet.possibly_sensitive === "boolean") {
    tweet.possibly_sensitive = data.tweet.possibly_sensitive;
  }
  if (data.tweet.conversation_id) {
    tweet.conversation_id = data.tweet.conversation_id;
  }
  if (data.tweet.community_id) {
    tweet.community_id = data.tweet.community_id;
  }
  if (data.tweet.context_annotations?.length) {
    tweet.context_annotations = data.tweet.context_annotations;
  }

  const noteTweet = safeJsonValue(data.tweet.note_tweet);
  if (noteTweet !== undefined) tweet.note_tweet = noteTweet;

  const article = safeJsonValue(data.tweet.article);
  if (article !== undefined) tweet.article = article;

  if (data.author.description) author.description = data.author.description;
  if (data.author.verified_type) author.verified_type = data.author.verified_type;
  if (data.author.public_metrics) {
    author.public_metrics = data.author.public_metrics;
  }

  const media = data.media.flatMap((item) => {
    const metadata: Record<string, unknown> = {
      media_key: item.media_key,
      type: item.type,
    };
    if (item.alt_text) metadata.alt_text = item.alt_text;
    if (item.public_metrics) metadata.public_metrics = item.public_metrics;
    return hasOwnData(metadata) && Object.keys(metadata).length > 2 ? [metadata] : [];
  });

  const metadata: Record<string, unknown> = { schemaVersion: 1 };
  if (hasOwnData(tweet)) metadata.tweet = tweet;
  if (hasOwnData(author)) metadata.author = author;
  if (media.length > 0) metadata.media = media;

  return Object.keys(metadata).length > 1
    ? (JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue)
    : Prisma.JsonNull;
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
    xMetadata: buildBookmarkXMetadata(data),
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
    xMetadata: buildBookmarkXMetadata(data),
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

  const rows = await prisma.bookmark.findMany({
    where: { userId, tweetId: { in: tweetIds } },
    select: { tweetId: true },
  });

  return new Set(rows.map((r) => r.tweetId));
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
