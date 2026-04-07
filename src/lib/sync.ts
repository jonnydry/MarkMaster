import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import { fetchBookmarks, BookmarkData, RateLimitError } from "./x-api";
import { getUserTokens } from "./auth";

export interface SyncResult {
  newBookmarks: number;
  updatedBookmarks: number;
  totalFetched: number;
  hitExisting: boolean;
  rateLimited: boolean;
  rateLimitResetsAt?: Date;
}

async function upsertBookmark(
  userId: string,
  data: BookmarkData
): Promise<"created" | "updated"> {
  const existing = await prisma.bookmark.findUnique({
    where: { userId_tweetId: { userId, tweetId: data.tweet.id } },
    select: { id: true },
  });

  const bookmarkData = {
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
        ? data.media.map((m) => ({
            type: m.type,
            url: m.url || m.preview_image_url,
            preview_image_url: m.preview_image_url,
            width: m.width,
            height: m.height,
          }))
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
                profile_image_url:
                  data.quotedTweet.author.profile_image_url,
              }
            : null,
        }
      : Prisma.JsonNull,
    tweetCreatedAt: new Date(data.tweet.created_at),
    syncedAt: new Date(),
  };

  if (existing) {
    await prisma.bookmark.update({
      where: { id: existing.id },
      data: bookmarkData,
    });
    return "updated";
  } else {
    await prisma.bookmark.create({
      data: { userId, ...bookmarkData },
    });
    return "created";
  }
}

export async function syncBookmarks(userId: string): Promise<SyncResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xId: true },
  });
  if (!user) throw new Error("User not found");

  const tokens = await getUserTokens(userId);
  if (!tokens) throw new Error("No tokens found");

  const result: SyncResult = {
    newBookmarks: 0,
    updatedBookmarks: 0,
    totalFetched: 0,
    hitExisting: false,
    rateLimited: false,
  };

  const hiddenTweetIds = new Set(
    (
      await prisma.hiddenBookmark.findMany({
        where: { userId },
        select: { tweetId: true },
      })
    ).map((bookmark: { tweetId: string }) => bookmark.tweetId)
  );

  let paginationToken: string | undefined;
  let shouldStop = false;

  try {
    do {
      const page = await fetchBookmarks(
        userId,
        tokens.accessToken,
        tokens.tokenExpiresAt,
        user.xId,
        paginationToken
      );

      for (const bookmark of page.bookmarks) {
        if (hiddenTweetIds.has(bookmark.tweet.id)) {
          continue;
        }

        result.totalFetched++;
        const op = await upsertBookmark(userId, bookmark);
        if (op === "created") result.newBookmarks++;
        else {
          result.updatedBookmarks++;
          result.hitExisting = true;
          shouldStop = true;
          break;
        }
      }

      paginationToken = shouldStop ? undefined : page.nextToken;
    } while (paginationToken && !shouldStop);
  } catch (error) {
    if (error instanceof RateLimitError) {
      result.rateLimited = true;
      result.rateLimitResetsAt = error.rateLimit.resetAt;
    } else {
      throw error;
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { lastSyncAt: new Date() },
  });

  return result;
}
