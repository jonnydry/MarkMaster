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

  await expireStaleSyncRuns(user.id);

  const runningSync = await prisma.syncRun.findFirst({
    where: { userId: user.id, status: "RUNNING" },
    orderBy: { startedAt: "desc" },
    select: syncRunSelect,
  });

  if (runningSync) {
    return NextResponse.json(
      { error: "A sync is already running.", currentRun: runningSync },
      { status: 409 }
    );
  }

  const syncRun = await prisma.syncRun.create({
    data: { userId: user.id },
    select: { id: true },
  });

  try {
    const result = await syncBookmarks(user.id);

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: result.rateLimited ? "RATE_LIMITED" : "COMPLETED",
        newBookmarks: result.newBookmarks,
        updatedBookmarks: result.updatedBookmarks,
        totalFetched: result.totalFetched,
        hitExisting: result.hitExisting,
        rateLimited: result.rateLimited,
        rateLimitResetsAt: result.rateLimitResetsAt,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ ...result, runId: syncRun.id });
  } catch (error) {
    console.error("Sync error:", error);

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Sync failed",
        completedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Sync failed",
        runId: syncRun.id,
      },
      { status: 500 }
    );
  }
}
