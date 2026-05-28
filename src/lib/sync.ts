import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import {
  fetchBookmarks,
  fetchBookmarkFolders,
  fetchBookmarksByFolder,
  BookmarkData,
  RateLimitError,
} from "./x-api";
import {
  updateBookmarksInBatches,
  buildBookmarkCreateData,
  getExistingTweetIdsForUserAndTweets,
  getHiddenTweetIdsForUserAndTweets,
  sleep,
} from "./sync-utils";

/**
 * Controls which sync engine is used.
 *
 * - `true`  (default): Use the new refactored engine (__syncBookmarksRefactored)
 * - `false`: Force the legacy engine (__syncBookmarksLegacy)
 *
 * We have now entered the cutover phase. The refactored engine is the default.
 * To force the legacy engine (emergency rollback), set:
 *   USE_REFACTORED_SYNC=false
 */
const USE_REFACTORED_SYNC = process.env.USE_REFACTORED_SYNC !== "false";

console.log(
  `[Sync] Using ${USE_REFACTORED_SYNC ? "REFACTORED" : "LEGACY"} sync engine ` +
    `(USE_REFACTORED_SYNC=${process.env.USE_REFACTORED_SYNC ?? "undefined"})`
);

const X_FOLDER_COLLECTION_SOURCE = "x-bookmark-folder";
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
 * @deprecated
 * Legacy sync implementation.
 *
 * This function is only kept for emergency rollback.
 * It should not be used in normal operation.
 *
 * If you see this function being called, it means someone has explicitly
 * disabled the refactored engine via `USE_REFACTORED_SYNC=false`.
 */
export async function __syncBookmarksLegacy(
  userId: string,
  resumeToken?: string,
): Promise<SyncResult> {
  console.warn(
    '[Sync] WARNING: __syncBookmarksLegacy was called. ' +
    'This should only happen during an emergency rollback.'
  );

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
    ).map((bookmark: { tweetId: string }) => bookmark.tweetId),
  );

  const existingTweetIds = new Set(
    (
      await prisma.bookmark.findMany({
        where: { userId },
        select: { tweetId: true },
      })
    ).map((bookmark: { tweetId: string }) => bookmark.tweetId),
  );

  const syncedTweetIds = new Set<string>();

  let paginationToken: string | undefined = resumeToken;
  let pagesFetched = 0;

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

      for (const bookmark of page.bookmarks) {
        syncedTweetIds.add(bookmark.tweet.id);

        if (hiddenTweetIds.has(bookmark.tweet.id)) continue;

        pageData.push({
          tweetId: bookmark.tweet.id,
          data: bookmark,
          isHidden: false,
        });
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
            data: newBookmarks.map((entry) =>
              buildBookmarkCreateData(userId, entry.data)
            ),
            skipDuplicates: true,
          });

          for (const entry of newBookmarks) {
            existingTweetIds.add(entry.tweetId);
          }
          result.newBookmarks += newBookmarks.length;
          result.totalFetched += newBookmarks.length;
        }

        result.updatedBookmarks += await updateBookmarksInBatches(
          userId,
          updateBookmarks,
        );
        result.hitExisting = updateBookmarks.length > 0;
        result.totalFetched += updateBookmarks.length;
      }

      paginationToken = page.nextToken;

      // If we've hit the page cap and there are more pages, save the resume token
      if (
        MAX_PAGES_PER_SYNC > 0 &&
        pagesFetched >= MAX_PAGES_PER_SYNC &&
        paginationToken
      ) {
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
      const { folders } = await fetchBookmarkFolders(userId, user.xId);

      for (const folder of folders) {
        const page = await fetchBookmarksByFolder(userId, user.xId, folder.id);

        const folderTweetIds: string[] = [];
        const seenFolderTweetIds = new Set<string>();
        const folderNewBookmarks: { tweetId: string; data: BookmarkData }[] =
          [];
        const folderUpdateBookmarks: { tweetId: string; data: BookmarkData }[] =
          [];

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
            data: folderNewBookmarks.map((entry) =>
              buildBookmarkCreateData(userId, entry.data)
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

/**
 * Refactored version of syncBookmarks using targeted per-page existence queries
 * instead of loading all tweetIds into memory upfront.
 *
 * Activated when the environment variable `USE_REFACTORED_SYNC=true`.
 */
/**
 * Internal export for differential testing only (Phase 2c).
 * Do not use in production code.
 */
export async function __syncBookmarksRefactored(
  userId: string,
  resumeToken?: string,
): Promise<SyncResult> {
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

  // === TEMPORARY DEBUG LOGGING FOR RESUME INVESTIGATION ===
  // Enable with: DEBUG_RESUME_TEST=1 npm test ...
  // Remove this entire block once the resume differential test is stable.
  const DEBUG_RESUME = process.env.DEBUG_RESUME_TEST === "1";
  if (DEBUG_RESUME) {
    console.log(
      `\n[REFAC] Starting __syncBookmarksRefactored | resumeToken=${resumeToken || "none"}`,
    );
  }

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

        // === TEMPORARY DEBUG (remove after resume investigation) ===
        if (DEBUG_RESUME) {
          console.log(
            `[REFAC] Page processed | paginationToken=${paginationToken} | pagesFetched=${pagesFetched}`,
          );
          console.log(`[REFAC] idsToCheck:`, idsToCheck);
          console.log(
            `[REFAC] dbExistingInPage:`,
            Array.from(dbExistingInPage),
          );
          console.log(
            `[REFAC] thisRunCreated (before this page):`,
            Array.from(thisRunCreated),
          );
        }

        const newBookmarks: typeof pageData = [];
        const updateBookmarks: typeof pageData = [];

        for (const entry of pageData) {
          const isExisting =
            dbExistingInPage.has(entry.tweetId) ||
            thisRunCreated.has(entry.tweetId);

          if (DEBUG_RESUME) {
            console.log(
              `[REFAC]   ${entry.tweetId} → isExisting=${isExisting} (db=${dbExistingInPage.has(entry.tweetId)}, thisRun=${thisRunCreated.has(entry.tweetId)})`,
            );
          }

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

        result.updatedBookmarks += await updateBookmarksInBatches(
          userId,
          updateBookmarks,
        );
        result.hitExisting = updateBookmarks.length > 0;
        result.totalFetched += updateBookmarks.length;
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

    // Folder phase - only on full completion
    if (!paginationToken && !result.resumeToken) {
      const { folders } = await fetchBookmarkFolders(userId, user.xId);

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

  // Only update lastSyncAt if we completed without rate-limiting and have no remaining pages
  if (!result.rateLimited && !result.resumeToken) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastSyncAt: new Date() },
    });
  } else if (!result.rateLimited && result.resumeToken) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastSyncAt: new Date() },
    });
  }

  if (DEBUG_RESUME) {
    console.log(`[REFAC] Finished __syncBookmarksRefactored | result=`, {
      newBookmarks: result.newBookmarks,
      updatedBookmarks: result.updatedBookmarks,
      totalFetched: result.totalFetched,
      rateLimited: result.rateLimited,
      resumeToken: result.resumeToken,
      pagesFetched: result.pagesFetched,
    });
    console.log(`[REFAC] Final thisRunCreated:`, Array.from(thisRunCreated));
    console.log(`[REFAC] Final syncedTweetIds:`, Array.from(syncedTweetIds));
  }

  return result;
}

/**
 * Main entry point for bookmark sync.
 *
 * The refactored engine is now the default.
 * The legacy engine is only kept for emergency rollback.
 */
export async function syncBookmarks(
  userId: string,
  resumeToken?: string,
): Promise<SyncResult> {
  if (USE_REFACTORED_SYNC) {
    return __syncBookmarksRefactored(userId, resumeToken);
  } else {
    console.error(
      '\n' +
      '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n' +
      '!!  ⚠️  EMERGENCY ROLLBACK MODE — LEGACY SYNC ENGINE IS ACTIVE  ⚠️  !!\n' +
      '!!                                                                  !!\n' +
      '!!  The refactored sync engine has been disabled via              !!\n' +
      '!!  USE_REFACTORED_SYNC=false.                                    !!\n' +
      '!!                                                                  !!\n' +
      '!!  This is only intended for emergency rollback.                 !!\n' +
      '!!  Set USE_REFACTORED_SYNC=true (or remove the variable)         !!\n' +
      '!!  to restore the normal (refactored) sync engine.               !!\n' +
      '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n'
    );

    return __syncBookmarksLegacy(userId, resumeToken);
  }
}
