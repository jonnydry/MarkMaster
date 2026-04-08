import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import {
  fetchBookmarks,
  fetchBookmarkFolders,
  fetchBookmarksByFolder,
  BookmarkData,
  RateLimitError,
} from "./x-api";

const X_FOLDER_COLLECTION_SOURCE = "x-bookmark-folder";
const X_FOLDER_COLLECTION_DESCRIPTION = "Synced from your X bookmark folder.";

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

async function syncFolderCollection(
  userId: string,
  folder: { id: string; name: string },
  tweetIds: string[]
) {
  const collection = await prisma.collection.upsert({
    where: {
      userId_externalSource_externalSourceId: {
        userId,
        externalSource: X_FOLDER_COLLECTION_SOURCE,
        externalSourceId: folder.id,
      },
    },
    update: {
      name: folder.name,
      description: X_FOLDER_COLLECTION_DESCRIPTION,
    },
    create: {
      userId,
      name: folder.name,
      description: X_FOLDER_COLLECTION_DESCRIPTION,
      externalSource: X_FOLDER_COLLECTION_SOURCE,
      externalSourceId: folder.id,
    },
    select: { id: true },
  });

  const bookmarks =
    tweetIds.length === 0
      ? []
      : await prisma.bookmark.findMany({
          where: { userId, tweetId: { in: tweetIds } },
          select: { id: true, tweetId: true },
        });

  const currentItems = await prisma.collectionItem.findMany({
    where: { collectionId: collection.id },
    select: {
      bookmarkId: true,
      bookmark: { select: { tweetId: true } },
    },
  });

  const nextTweetIds = new Set(tweetIds);
  const bookmarkOrder = new Map(tweetIds.map((tweetId, index) => [tweetId, index]));
  const staleBookmarkIds = currentItems
    .filter((item) => !nextTweetIds.has(item.bookmark.tweetId))
    .map((item) => item.bookmarkId);

  const operations = [
    ...bookmarks.map((bookmark) =>
      prisma.collectionItem.upsert({
        where: {
          collectionId_bookmarkId: {
            collectionId: collection.id,
            bookmarkId: bookmark.id,
          },
        },
        update: { sortOrder: bookmarkOrder.get(bookmark.tweetId) ?? 0 },
        create: {
          collectionId: collection.id,
          bookmarkId: bookmark.id,
          sortOrder: bookmarkOrder.get(bookmark.tweetId) ?? 0,
        },
      })
    ),
    ...(staleBookmarkIds.length > 0
      ? [
          prisma.collectionItem.deleteMany({
            where: {
              collectionId: collection.id,
              bookmarkId: { in: staleBookmarkIds },
            },
          }),
        ]
      : []),
  ];

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }
}

export async function syncBookmarks(userId: string): Promise<SyncResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xId: true },
  });
  if (!user) throw new Error("User not found");

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

  const existingTweetIds = new Set(
    (
      await prisma.bookmark.findMany({
        where: { userId },
        select: { tweetId: true },
      })
    ).map((bookmark: { tweetId: string }) => bookmark.tweetId)
  );

  const syncedTweetIds = new Set<string>();

  let paginationToken: string | undefined;
  let shouldStop = false;

  try {
    do {
      const page = await fetchBookmarks(
        userId,
        user.xId,
        paginationToken
      );

      for (const bookmark of page.bookmarks) {
        syncedTweetIds.add(bookmark.tweet.id);

        if (hiddenTweetIds.has(bookmark.tweet.id)) {
          continue;
        }

        result.totalFetched++;
        const op = await upsertBookmark(userId, bookmark);
        if (op === "created") {
          result.newBookmarks++;
          existingTweetIds.add(bookmark.tweet.id);
        }
        else {
          result.updatedBookmarks++;
          result.hitExisting = true;
          shouldStop = true;
          break;
        }
      }

      paginationToken = shouldStop ? undefined : page.nextToken;
    } while (paginationToken && !shouldStop);

    const { folders } = await fetchBookmarkFolders(
      userId,
      user.xId
    );

    for (const folder of folders) {
      const page = await fetchBookmarksByFolder(
        userId,
        user.xId,
        folder.id
      );

      const folderTweetIds: string[] = [];
      const seenFolderTweetIds = new Set<string>();

      for (const bookmark of page.bookmarks) {
        const tweetId = bookmark.tweet.id;

        if (hiddenTweetIds.has(tweetId) || seenFolderTweetIds.has(tweetId)) {
          continue;
        }

        seenFolderTweetIds.add(tweetId);
        folderTweetIds.push(tweetId);

        if (syncedTweetIds.has(tweetId) || existingTweetIds.has(tweetId)) {
          continue;
        }

        syncedTweetIds.add(tweetId);
        result.totalFetched++;

        const op = await upsertBookmark(userId, bookmark);
        if (op === "created") {
          result.newBookmarks++;
          existingTweetIds.add(tweetId);
        } else {
          result.updatedBookmarks++;
          existingTweetIds.add(tweetId);
        }
      }

      await syncFolderCollection(userId, folder, folderTweetIds);
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      result.rateLimited = true;
      result.rateLimitResetsAt = error.rateLimit.resetAt;
    } else {
      throw error;
    }
  }

  if (!result.rateLimited) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastSyncAt: new Date() },
    });
  }

  return result;
}
