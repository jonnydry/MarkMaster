import { after, NextResponse } from "next/server";
import { z } from "zod";

import { getDbUser } from "@/lib/auth";
import { checkRateLimit, checkGlobalRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import {
  ACTIVE_SYNC_STATUSES,
  enqueueSyncRun,
  kickSyncWorker,
  STALE_SYNC_WINDOW_MS,
  syncRunSelect,
  type SyncRunSnapshot,
} from "@/lib/sync-queue";
import { getRetryAfterSeconds } from "@/lib/sync-throttle";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";

const syncPostBodySchema = z.object({
  includeFolders: z.boolean().optional(),
});

const SYNC_POST_MAX_JSON_BODY_BYTES = 256 * 1024;

function syncCooldownResponse(
  retryUntil: Date,
  latestRun: SyncRunSnapshot
) {
  return NextResponse.json(
    {
      error: "Sync is cooling down. Please try again shortly.",
      retryUntil: retryUntil.toISOString(),
      latestRun,
    },
    {
      status: 429,
      headers: {
        "Retry-After": getRetryAfterSeconds(retryUntil).toString(),
      },
    }
  );
}

export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let currentRun: SyncRunSnapshot | null = await prisma.syncRun.findFirst({
    where: {
      userId: user.id,
      status: { in: [...ACTIVE_SYNC_STATUSES] },
    },
    orderBy: { startedAt: "desc" },
    select: syncRunSelect,
  });

  if (
    currentRun &&
    currentRun.startedAt < new Date(Date.now() - STALE_SYNC_WINDOW_MS)
  ) {
    await prisma.syncRun.updateMany({
      where: {
        userId: user.id,
        status: { in: [...ACTIVE_SYNC_STATUSES] },
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
    currentRun = null;
  }

  const recentRuns = await prisma.syncRun.findMany({
    where: {
      userId: user.id,
      status: { notIn: [...ACTIVE_SYNC_STATUSES] },
    },
    orderBy: { startedAt: "desc" },
    take: 5,
    select: syncRunSelect,
  });

  return NextResponse.json(
    { currentRun, recentRuns },
    {
      headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=15" },
    }
  );
}

export async function POST(req: Request) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let includeFolders = user.syncXFolders ?? false;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await readJsonBody(req, SYNC_POST_MAX_JSON_BODY_BYTES);
    if (!body.ok) {
      return NextResponse.json({ error: body.error }, { status: body.status });
    }

    const parsed = syncPostBodySchema.safeParse(body.data);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid sync request body" }, { status: 400 });
    }
    if (parsed.data.includeFolders !== undefined) {
      includeFolders = parsed.data.includeFolders;
    }
  }

  const [rateLimitResult, globalResult] = await Promise.all([
    checkRateLimit("sync", user.id),
    checkGlobalRateLimit("sync"),
  ]);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }
  if (!globalResult.success) {
    return createRateLimitResponse(globalResult);
  }

  const syncRun = await enqueueSyncRun(user.id, { includeFolders });

  if ("conflict" in syncRun) {
    return NextResponse.json(
      { error: "A sync is already running.", currentRun: syncRun.conflict },
      { status: 409 }
    );
  }

  if ("cooldown" in syncRun) {
    return syncCooldownResponse(
      syncRun.cooldown.retryUntil,
      syncRun.cooldown.latestRun
    );
  }

  const runId = syncRun.created.id;

  after(() => kickSyncWorker(runId));

  return NextResponse.json(
    {
      runId,
      status: "PENDING",
      accepted: true,
    },
    { status: 202 }
  );
}
