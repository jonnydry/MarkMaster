import { prisma } from "@/lib/prisma";
import { syncBookmarks } from "@/lib/sync";
import { invalidateUserResponseCache } from "@/lib/upstash-cache";

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
        await prisma.syncRun.update({
          where: { id: runId },
          data: progress,
        });
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

    await prisma.syncRun.update({
      where: { id: runId },
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

    await invalidateUserResponseCache(userId);
  } catch (error) {
    console.error("Sync error:", error);

    await prisma.syncRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Sync failed",
        completedAt: new Date(),
      },
    });
  }
}
