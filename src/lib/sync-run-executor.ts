import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { syncBookmarks } from "@/lib/sync";
import { invalidateUserResponseCacheImmediate } from "@/lib/upstash-cache";

/**
 * Thrown when the run row is no longer RUNNING (e.g. it was marked stale and
 * FAILED after 30 minutes, and possibly replaced by a new run). The executor
 * must stop immediately: continuing would mutate a row the UI already
 * reported as failed and race the replacement run's X API calls.
 */
class SyncRunSupersededError extends Error {
  constructor(runId: string) {
    super(`Sync run ${runId} is no longer RUNNING; aborting stale executor.`);
    this.name = "SyncRunSupersededError";
  }
}

export async function executeSyncRun(
  runId: string,
  userId: string,
  resumeToken?: string,
  includeFolders = false
) {
  try {
    const result = await syncBookmarks(
      userId,
      resumeToken,
      async (progress) => {
        // Conditional write: only touch the row while we still own it.
        const updated = await prisma.syncRun.updateMany({
          where: { id: runId, status: "RUNNING" },
          data: progress,
        });
        if (updated.count === 0) {
          throw new SyncRunSupersededError(runId);
        }
      },
      { includeFolders }
    );

    if (resumeToken) {
      await prisma.syncRun.updateMany({
        where: {
          userId,
          resumeToken,
          status: { in: ["COMPLETED", "RATE_LIMITED"] },
        },
        data: { resumeToken: null },
      });
    }

    // Conditional completion: never flip a stale-marked FAILED run back to
    // COMPLETED after a replacement run has been allowed to start.
    const completed = await prisma.syncRun.updateMany({
      where: { id: runId, status: "RUNNING" },
      data: {
        status: result.rateLimited ? "RATE_LIMITED" : "COMPLETED",
        newBookmarks: result.newBookmarks,
        updatedBookmarks: result.updatedBookmarks,
        totalFetched: result.totalFetched,
        hitExisting: result.hitExisting,
        rateLimited: result.rateLimited,
        rateLimitResetsAt: result.rateLimitResetsAt,
        pagesFetched: result.pagesFetched,
        resumeToken: result.resumeToken ?? null,
        completedAt: new Date(),
      },
    });
    if (completed.count === 0) {
      logError(
        "SyncExecutor",
        `Run ${runId} finished but was already marked stale; result discarded.`
      );
    }

    // Bookmarks were written either way — downstream caches must refresh.
    await invalidateUserResponseCacheImmediate(userId);
  } catch (error) {
    if (error instanceof SyncRunSupersededError) {
      // The row is already FAILED (stale marker); bookmark writes so far are
      // durable, so just refresh caches and stop quietly.
      logError("SyncExecutor", error.message);
      await invalidateUserResponseCacheImmediate(userId);
      return;
    }

    logError("SyncExecutor", `Sync run ${runId} failed`, error);

    await prisma.syncRun.updateMany({
      where: { id: runId, status: "RUNNING" },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Sync failed",
        completedAt: new Date(),
      },
    });
  }
}
