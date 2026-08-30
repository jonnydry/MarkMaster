import { prisma } from "./prisma";
import {
  fetchBookmarks,
  fetchBookmarksByFolder,
  BookmarkData,
  RateLimitError,
} from "./x-api";
import {
  resolveXFoldersForSync,
  X_FOLDER_COLLECTION_SOURCE,
} from "./sync-folder-metadata";
import {
  updateBookmarksInBatches,
  buildBookmarkCreateData,
  getExistingTweetIdsForUserAndTweets,
  getHiddenTweetIdsForUserAndTweets,
  sleep,
} from "./sync-utils";

const X_FOLDER_COLLECTION_DESCRIPTION = "Synced from your X bookmark folder.";

/** Max pages to fetch per sync run (0 = unlimited). Keep low to limit API spend. */
const MAX_PAGES_PER_SYNC = 10;

/** Delay in ms between API pages to stay under X rate limits (~180 req/15min). */
const PAGE_THROTTLE_MS = 5_000;

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

export type SyncProgressSnapshot = Pick<
  SyncResult,
  "newBookmarks" | "updatedBookmarks" | "totalFetched" | "hitExisting" | "pagesFetched"
>;

export type SyncProgressCallback = (
  snapshot: SyncProgressSnapshot
) => void | Promise<void>;

export type SyncBookmarksOptions = {
  /** Reconcile X bookmark folders into synced collections after the head pass. */
  includeFolders?: boolean;
};

async function emitSyncProgress(
  onProgress: SyncProgressCallback | undefined,
  result: SyncResult
) {
  if (!onProgress) return;

  await onProgress({
    newBookmarks: result.newBookmarks,
    updatedBookmarks: result.updatedBookmarks,
    totalFetched: result.totalFetched,
    hitExisting: result.hitExisting,
    pagesFetched: result.pagesFetched,
  });
}

/** Stop after the first all-existing page when syncing from the head (not resuming). */
function shouldStopIncrementalSync(
  startedWithResumeToken: boolean,
  pageDataLength: number,
  newBookmarkCount: number
) {
  return (
    !startedWithResumeToken &&
    pageDataLength > 0 &&
    newBookmarkCount === 0
  );
}

/** Skip rewriting known bookmarks when incremental head sync found nothing new. */
function shouldSkipExistingBookmarkUpdates(
  startedWithResumeToken: boolean,
  pageDataLength: number,
  newBookmarkCount: number
) {
  return shouldStopIncrementalSync(
    startedWithResumeToken,
    pageDataLength,
    newBookmarkCount
  );
}

async function syncFolderCollection(
  userId: string,
  folder: { id: string; name: string },
  tweetIds: string[],
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
  const bookmarkOrder = new Map(
    tweetIds.map((tweetId, index) => [tweetId, index]),
  );
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
      }),
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

/**
 * Sync bookmarks from X using targeted per-page existence queries
 * instead of loading all tweetIds into memory upfront.
 */
export async function syncBookmarks(
  userId: string,
  resumeToken?: string,
  onProgress?: SyncProgressCallback,
  options: SyncBookmarksOptions = {},
): Promise<SyncResult> {
  const includeFolders = options.includeFolders ?? false;
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

  const syncedTweetIds = new Set<string>();
  const thisRunCreated = new Set<string>();

  let paginationToken: string | undefined = resumeToken;
  let pagesFetched = 0;
  const startedWithResumeToken = Boolean(resumeToken);

  try {
    do {
      const page = await fetchBookmarks(userId, user.xId, paginationToken);

      result.pagesFetched++;
      pagesFetched++;

      const pageData: {
        tweetId: string;
        data: BookmarkData;
        isHidden: boolean;
      }[] = [];

      const pageTweetIds = page.bookmarks.map((b) => b.tweet.id);
      pageTweetIds.forEach((id) => syncedTweetIds.add(id));

      const hiddenInThisPage = await getHiddenTweetIdsForUserAndTweets(
        userId,
        pageTweetIds,
      );

      for (const bookmark of page.bookmarks) {
        if (hiddenInThisPage.has(bookmark.tweet.id)) continue;

        pageData.push({
          tweetId: bookmark.tweet.id,
          data: bookmark,
          isHidden: false,
        });
      }

      if (pageData.length > 0) {
        const idsToCheck = pageData.map((e) => e.tweetId);
        const dbExistingInPage = await getExistingTweetIdsForUserAndTweets(
          userId,
          idsToCheck,
        );

        const newBookmarks: typeof pageData = [];
        const updateBookmarks: typeof pageData = [];

        for (const entry of pageData) {
          const isExisting =
            dbExistingInPage.has(entry.tweetId) ||
            thisRunCreated.has(entry.tweetId);

          if (isExisting) {
            updateBookmarks.push(entry);
          } else {
            newBookmarks.push(entry);
          }
        }

        if (newBookmarks.length > 0) {
          await prisma.bookmark.createMany({
            data: newBookmarks.map((entry) =>
              buildBookmarkCreateData(userId, entry.data),
            ),
            skipDuplicates: true,
          });

          for (const entry of newBookmarks) {
            thisRunCreated.add(entry.tweetId);
          }
          result.newBookmarks += newBookmarks.length;
          result.totalFetched += newBookmarks.length;
        }

        const skipExistingUpdates = shouldSkipExistingBookmarkUpdates(
          startedWithResumeToken,
          pageData.length,
          newBookmarks.length,
        );

        if (updateBookmarks.length > 0) {
          result.hitExisting = true;

          if (!skipExistingUpdates) {
            result.updatedBookmarks += await updateBookmarksInBatches(
              userId,
              updateBookmarks,
            );
            result.totalFetched += updateBookmarks.length;
          }
        }

        await emitSyncProgress(onProgress, result);

        if (
          shouldStopIncrementalSync(
            startedWithResumeToken,
            pageData.length,
            newBookmarks.length,
          )
        ) {
          paginationToken = undefined;
          break;
        }
      } else {
        await emitSyncProgress(onProgress, result);
      }

      paginationToken = page.nextToken;

      if (
        MAX_PAGES_PER_SYNC > 0 &&
        pagesFetched >= MAX_PAGES_PER_SYNC &&
        paginationToken
      ) {
        result.resumeToken = paginationToken;
        break;
      }

      if (paginationToken && PAGE_THROTTLE_MS > 0) {
        await sleep(PAGE_THROTTLE_MS);
      }
    } while (paginationToken);

    // Folder phase — only when opted in and the head pass finished without a resume token.
    if (includeFolders && !paginationToken && !result.resumeToken) {
      const { folders } = await resolveXFoldersForSync(userId, user.xId);

      for (const folder of folders) {
        const page = await fetchBookmarksByFolder(userId, user.xId, folder.id);

        const folderTweetIds: string[] = [];
        const seenFolderTweetIds = new Set<string>();
        const folderNewBookmarks: { tweetId: string; data: BookmarkData }[] =
          [];
        const folderUpdateBookmarks: { tweetId: string; data: BookmarkData }[] =
          [];

        const folderAllIds = page.bookmarks.map((b) => b.tweet.id);
        const hiddenInFolder = await getHiddenTweetIdsForUserAndTweets(
          userId,
          folderAllIds,
        );
        const dbExistingInFolder = await getExistingTweetIdsForUserAndTweets(
          userId,
          folderAllIds,
        );

        for (const bookmark of page.bookmarks) {
          const tweetId = bookmark.tweet.id;

          if (hiddenInFolder.has(tweetId) || seenFolderTweetIds.has(tweetId)) {
            continue;
          }

          seenFolderTweetIds.add(tweetId);
          folderTweetIds.push(tweetId);

          const wasSyncedThisRun = syncedTweetIds.has(tweetId);
          const isExisting =
            dbExistingInFolder.has(tweetId) || thisRunCreated.has(tweetId);

          if (wasSyncedThisRun || isExisting) {
            if (!wasSyncedThisRun && isExisting) {
              folderUpdateBookmarks.push({ tweetId, data: bookmark });
            }
            continue;
          }

          syncedTweetIds.add(tweetId);

          if (isExisting) {
            folderUpdateBookmarks.push({ tweetId, data: bookmark });
          } else {
            folderNewBookmarks.push({ tweetId, data: bookmark });
            thisRunCreated.add(tweetId);
          }
        }

        if (folderNewBookmarks.length > 0) {
          await prisma.bookmark.createMany({
            data: folderNewBookmarks.map((entry) =>
              buildBookmarkCreateData(userId, entry.data),
            ),
            skipDuplicates: true,
          });
          result.newBookmarks += folderNewBookmarks.length;
          result.totalFetched += folderNewBookmarks.length;
        }

        result.updatedBookmarks += await updateBookmarksInBatches(
          userId,
          folderUpdateBookmarks,
        );
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

  // Only update lastSyncAt if we completed without rate-limiting and have no
  // remaining pages (the page cap can leave a resumeToken without a 429).
  if (!result.rateLimited && !result.resumeToken) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastSyncAt: new Date() },
    });
  }

  return result;
}
