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

/** Max pages to fetch per sync run (0 = unlimited). Keep low to limit API spend. */
const MAX_PAGES_PER_SYNC = 10;

/** Delay in ms between API pages to stay under X rate limits (~180 req/15min). */
const PAGE_THROTTLE_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SyncResult {
  newBookmarks: number;
  updatedBookmarks: number;
  totalFetched: number;
  hitExisting: boolean;
  rateLimited: boolean;
  rateLimitResetsAt?: Date;
  pagesFetched: number;
  resumeToken?: string;
}

function buildBookmarkUpdateData(data: BookmarkData) {
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
      type: "x_folder",
    },
    create: {
      userId,
      name: folder.name,
      description: X_FOLDER_COLLECTION_DESCRIPTION,
      type: "x_folder",
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

export async function syncBookmarks(userId: string, resumeToken?: string): Promise<SyncResult> {
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
    pagesFetched: 0,
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

  let paginationToken: string | undefined = resumeToken;
  let pagesFetched = 0;

  try {
    do {
      const page = await fetchBookmarks(
        userId,
        user.xId,
        paginationToken
      );

      result.pagesFetched++;
      pagesFetched++;

      const pageData: {
        tweetId: string;
        data: BookmarkData;
        isHidden: boolean;
      }[] = [];

      for (const bookmark of page.bookmarks) {
        syncedTweetIds.add(bookmark.tweet.id);

        if (hiddenTweetIds.has(bookmark.tweet.id)) continue;

        pageData.push({ tweetId: bookmark.tweet.id, data: bookmark, isHidden: false });
      }

      if (pageData.length > 0) {
        const newBookmarks: typeof pageData = [];
        const updateBookmarks: typeof pageData = [];

        for (const entry of pageData) {
          if (existingTweetIds.has(entry.tweetId)) {
            updateBookmarks.push(entry);
          } else {
            newBookmarks.push(entry);
          }
        }

        if (newBookmarks.length > 0) {
          await prisma.bookmark.createMany({
            data: newBookmarks.map((entry) => ({
              userId,
              tweetId: entry.data.tweet.id,
              authorId: entry.data.author.id,
              authorUsername: entry.data.author.username,
              authorDisplayName: entry.data.author.name,
              authorProfileImage: entry.data.author.profile_image_url || null,
              authorVerified: entry.data.author.verified || false,
              tweetText: entry.data.tweet.text,
              publicMetrics: entry.data.tweet.public_metrics ?? Prisma.JsonNull,
              media:
                entry.data.media.length > 0
                  ? entry.data.media.map((m) => ({
                      type: m.type,
                      url: m.url || m.preview_image_url,
                      preview_image_url: m.preview_image_url,
                      width: m.width,
                      height: m.height,
                    }))
                  : Prisma.JsonNull,
              urls: entry.data.tweet.entities?.urls ?? Prisma.JsonNull,
              quotedTweet: entry.data.quotedTweet
                ? {
                    id: entry.data.quotedTweet.id,
                    text: entry.data.quotedTweet.text,
                    author: entry.data.quotedTweet.author
                      ? {
                          name: entry.data.quotedTweet.author.name,
                          username: entry.data.quotedTweet.author.username,
                          profile_image_url:
                            entry.data.quotedTweet.author.profile_image_url,
                        }
                      : null,
                  }
                : Prisma.JsonNull,
              tweetCreatedAt: new Date(entry.data.tweet.created_at),
              syncedAt: new Date(),
            })),
            skipDuplicates: true,
          });

          for (const entry of newBookmarks) {
            existingTweetIds.add(entry.tweetId);
          }
          result.newBookmarks += newBookmarks.length;
          result.totalFetched += newBookmarks.length;
        }

        const updateResults = await Promise.all(
          updateBookmarks.map((entry) => {
            const bookmarkData = buildBookmarkUpdateData(entry.data);
            return prisma.bookmark.updateMany({
              where: { userId, tweetId: entry.tweetId },
              data: bookmarkData,
            });
          })
        );
        result.updatedBookmarks += updateResults.reduce((sum, r) => sum + r.count, 0);
        result.hitExisting = updateBookmarks.length > 0;
        result.totalFetched += updateBookmarks.length;
      }

      paginationToken = page.nextToken;

      // If we've hit the page cap and there are more pages, save the resume token
      if (MAX_PAGES_PER_SYNC > 0 && pagesFetched >= MAX_PAGES_PER_SYNC && paginationToken) {
        result.resumeToken = paginationToken;
        break;
      }

      // Throttle between pages to stay under rate limits
      if (paginationToken && PAGE_THROTTLE_MS > 0) {
        await sleep(PAGE_THROTTLE_MS);
      }
    } while (paginationToken);

    // Folder-backed collections should refresh once bookmark pagination fully finishes,
    // including after a resumed sync run.
    if (!paginationToken && !result.resumeToken) {
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
        const folderNewBookmarks: { tweetId: string; data: BookmarkData }[] = [];
        const folderUpdateBookmarks: { tweetId: string; data: BookmarkData }[] = [];

        for (const bookmark of page.bookmarks) {
          const tweetId = bookmark.tweet.id;

          if (hiddenTweetIds.has(tweetId) || seenFolderTweetIds.has(tweetId)) {
            continue;
          }

          seenFolderTweetIds.add(tweetId);
          folderTweetIds.push(tweetId);

          if (syncedTweetIds.has(tweetId) || existingTweetIds.has(tweetId)) {
            if (!syncedTweetIds.has(tweetId) && existingTweetIds.has(tweetId)) {
              folderUpdateBookmarks.push({ tweetId, data: bookmark });
            }
            continue;
          }

          syncedTweetIds.add(tweetId);

          if (existingTweetIds.has(tweetId)) {
            folderUpdateBookmarks.push({ tweetId, data: bookmark });
          } else {
            folderNewBookmarks.push({ tweetId, data: bookmark });
            existingTweetIds.add(tweetId);
          }
        }

        if (folderNewBookmarks.length > 0) {
          await prisma.bookmark.createMany({
            data: folderNewBookmarks.map((entry) => ({
              userId,
              tweetId: entry.data.tweet.id,
              authorId: entry.data.author.id,
              authorUsername: entry.data.author.username,
              authorDisplayName: entry.data.author.name,
              authorProfileImage: entry.data.author.profile_image_url || null,
              authorVerified: entry.data.author.verified || false,
              tweetText: entry.data.tweet.text,
              publicMetrics: entry.data.tweet.public_metrics ?? Prisma.JsonNull,
              media:
                entry.data.media.length > 0
                  ? entry.data.media.map((m) => ({
                      type: m.type,
                      url: m.url || m.preview_image_url,
                      preview_image_url: m.preview_image_url,
                      width: m.width,
                      height: m.height,
                    }))
                  : Prisma.JsonNull,
              urls: entry.data.tweet.entities?.urls ?? Prisma.JsonNull,
              quotedTweet: entry.data.quotedTweet
                ? {
                    id: entry.data.quotedTweet.id,
                    text: entry.data.quotedTweet.text,
                    author: entry.data.quotedTweet.author
                      ? {
                          name: entry.data.quotedTweet.author.name,
                          username: entry.data.quotedTweet.author.username,
                          profile_image_url:
                            entry.data.quotedTweet.author.profile_image_url,
                        }
                      : null,
                  }
                : Prisma.JsonNull,
              tweetCreatedAt: new Date(entry.data.tweet.created_at),
              syncedAt: new Date(),
            })),
            skipDuplicates: true,
          });
          result.newBookmarks += folderNewBookmarks.length;
          result.totalFetched += folderNewBookmarks.length;
        }

        const folderUpdateResults = await Promise.all(
          folderUpdateBookmarks.map((entry) => {
            const bookmarkData = buildBookmarkUpdateData(entry.data);
            return prisma.bookmark.updateMany({
              where: { userId, tweetId: entry.tweetId },
              data: bookmarkData,
            });
          })
        );
        result.updatedBookmarks += folderUpdateResults.reduce((sum, r) => sum + r.count, 0);
        result.totalFetched += folderUpdateBookmarks.length;

        await syncFolderCollection(userId, folder, folderTweetIds);
      }
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      result.rateLimited = true;
      result.rateLimitResetsAt = error.rateLimit.resetAt;
      if (paginationToken) {
        result.resumeToken = paginationToken;
      }
    } else {
      throw error;
    }
  }

  // Only update lastSyncAt if we completed without rate-limiting and have no remaining pages
  if (!result.rateLimited && !result.resumeToken) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastSyncAt: new Date() },
    });
  } else if (!result.rateLimited && result.resumeToken) {
    // Partial sync completed — update lastSyncAt so the next sync knows we got something
    await prisma.user.update({
      where: { id: userId },
      data: { lastSyncAt: new Date() },
    });
  }

  return result;
}
