import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDbUser } from "@/lib/auth";
import { syncBookmarks } from "@/lib/sync";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const STALE_SYNC_WINDOW_MS = 30 * 60 * 1000;

const syncRunSelect = {
  id: true,
  status: true,
  newBookmarks: true,
  updatedBookmarks: true,
  totalFetched: true,
  hitExisting: true,
  rateLimited: true,
  rateLimitResetsAt: true,
  errorMessage: true,
  pagesFetched: true,
  resumeToken: true,
  startedAt: true,
  completedAt: true,
} as const;

async function expireStaleSyncRuns(userId: string) {
  await prisma.syncRun.updateMany({
    where: {
      userId,
      status: "RUNNING",
      startedAt: {
        lt: new Date(Date.now() - STALE_SYNC_WINDOW_MS),
      },
    },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorMessage: "Sync did not finish.",
    },
  });
}

export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await expireStaleSyncRuns(user.id);

  const [currentRun, recentRuns] = await Promise.all([
    prisma.syncRun.findFirst({
      where: { userId: user.id, status: "RUNNING" },
      orderBy: { startedAt: "desc" },
      select: syncRunSelect,
    }),
    prisma.syncRun.findMany({
      where: { userId: user.id, status: { not: "RUNNING" } },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: syncRunSelect,
    }),
  ]);

  return NextResponse.json({ currentRun, recentRuns });
}

export async function POST() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = checkRateLimit(`sync:${user.id}`);
  if (!rate.allowed) {
    return rateLimitResponse(rate.resetAt);
  }

  // Check for a resume token from the most recent rate-limited/paused sync
  const lastRun = await prisma.syncRun.findFirst({
    where: {
      userId: user.id,
      status: { in: ["COMPLETED", "RATE_LIMITED"] },
      resumeToken: { not: null },
    },
    orderBy: { startedAt: "desc" },
    select: { resumeToken: true },
  });

  const resumeToken = lastRun?.resumeToken ?? undefined;

  const syncRun = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "SyncRun" SET status = 'FAILED', "completedAt" = NOW(), "errorMessage" = 'Superseded by new sync'
      WHERE "userId" = ${user.id} AND status = 'RUNNING' AND "startedAt" < NOW() - INTERVAL '5 minutes'
    `;

    const running = await tx.syncRun.findFirst({
      where: { userId: user.id, status: "RUNNING" },
      select: syncRunSelect,
    });

    if (running) {
      return { conflict: running } as const;
    }

    return { created: await tx.syncRun.create({ data: { userId: user.id }, select: { id: true } }) } as const;
  });

  if ("conflict" in syncRun && syncRun.conflict) {
    return NextResponse.json(
      { error: "A sync is already running.", currentRun: syncRun.conflict },
      { status: 409 }
    );
  }

  const effectiveId = "created" in syncRun ? syncRun.created.id : "";

  try {
    const result = await syncBookmarks(user.id, resumeToken);

    // If we resumed, clear the old resume token
    if (resumeToken) {
      await prisma.syncRun.updateMany({
        where: {
          userId: user.id,
          resumeToken,
          status: { in: ["COMPLETED", "RATE_LIMITED"] },
        },
        data: { resumeToken: null },
      });
    }

    await prisma.syncRun.update({
      where: { id: effectiveId },
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

    return NextResponse.json({ ...result, runId: effectiveId });
  } catch (error) {
    console.error("Sync error:", error);

    await prisma.syncRun.update({
      where: { id: effectiveId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Sync failed",
        completedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Sync failed",
        runId: effectiveId,
      },
      { status: 500 }
    );
  }
}
