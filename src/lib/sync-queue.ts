import { timingSafeEqual } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { executeSyncRun } from "@/lib/sync-run-executor";
import { getSyncRetryUntil } from "@/lib/sync-throttle";

export const ACTIVE_SYNC_STATUSES = ["PENDING", "RUNNING"] as const;

export const STALE_SYNC_WINDOW_MS = 30 * 60 * 1000;

export const syncRunSelect = {
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
  continuationToken: true,
  includeFolders: true,
  startedAt: true,
  completedAt: true,
} as const;

export type SyncRunSnapshot = Prisma.SyncRunGetPayload<{
  select: typeof syncRunSelect;
}>;

export type EnqueueSyncResult =
  | { conflict: SyncRunSnapshot }
  | { cooldown: { retryUntil: Date; latestRun: SyncRunSnapshot } }
  | { created: { id: string }; continuationToken?: string };

async function resolveContinuationToken(
  tx: Prisma.TransactionClient,
  userId: string,
  latestRun: SyncRunSnapshot | null
) {
  const resumeRun =
    latestRun?.resumeToken
      ? latestRun
      : await tx.syncRun.findFirst({
          where: {
            userId,
            status: { in: ["COMPLETED", "RATE_LIMITED"] },
            resumeToken: { not: null },
          },
          orderBy: { startedAt: "desc" },
          select: syncRunSelect,
        });

  return resumeRun?.resumeToken ?? undefined;
}

export async function markStaleActiveSyncRuns(
  tx: Prisma.TransactionClient,
  userId: string
) {
  await tx.syncRun.updateMany({
    where: {
      userId,
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
}

export async function enqueueSyncRun(
  userId: string,
  options: { includeFolders?: boolean } = {}
): Promise<EnqueueSyncResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sync:${userId}`}))`;

    await markStaleActiveSyncRuns(tx, userId);

    const active = await tx.syncRun.findFirst({
      where: {
        userId,
        status: { in: [...ACTIVE_SYNC_STATUSES] },
      },
      select: syncRunSelect,
    });

    if (active) {
      return { conflict: active };
    }

    const latestRun = await tx.syncRun.findFirst({
      where: { userId, status: { in: ["COMPLETED", "RATE_LIMITED"] } },
      orderBy: { startedAt: "desc" },
      select: syncRunSelect,
    });

    if (latestRun) {
      const retryUntil = getSyncRetryUntil(latestRun);
      if (retryUntil) {
        return { cooldown: { retryUntil, latestRun } };
      }
    }

    const continuationToken = await resolveContinuationToken(
      tx,
      userId,
      latestRun
    );

    const created = await tx.syncRun.create({
      data: {
        userId,
        status: "PENDING",
        continuationToken: continuationToken ?? null,
        includeFolders: options.includeFolders ?? false,
      },
      select: { id: true },
    });

    return { created, continuationToken };
  });
}

export async function processSyncRun(runId: string) {
  const claimed = await prisma.$transaction(async (tx) => {
    const run = await tx.syncRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        userId: true,
        status: true,
        continuationToken: true,
        includeFolders: true,
      },
    });

    if (!run || run.status !== "PENDING") {
      return null;
    }

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sync:${run.userId}`}))`;

    const active = await tx.syncRun.findFirst({
      where: {
        userId: run.userId,
        status: "RUNNING",
        id: { not: run.id },
      },
      select: { id: true },
    });

    if (active) {
      return null;
    }

    return tx.syncRun.update({
      where: { id: runId, status: "PENDING" },
      data: { status: "RUNNING" },
      select: {
        id: true,
        userId: true,
        continuationToken: true,
        includeFolders: true,
      },
    });
  });

  if (!claimed) {
    return { processed: false as const };
  }

  await executeSyncRun(
    claimed.id,
    claimed.userId,
    claimed.continuationToken ?? undefined,
    claimed.includeFolders
  );

  return { processed: true as const, runId: claimed.id };
}

export async function processPendingSyncRuns(limit = 1) {
  const pending = await prisma.syncRun.findMany({
    where: { status: "PENDING" },
    orderBy: { startedAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const results = [];
  for (const run of pending) {
    results.push(await processSyncRun(run.id));
  }

  return results;
}

function getSyncWorkerBaseUrl() {
  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();
  if (nextAuthUrl) {
    return nextAuthUrl.replace(/\/$/, "");
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  return "http://localhost:3000";
}

/** Dispatch a separate worker invocation (own maxDuration budget). */
export async function kickSyncWorker(runId: string) {
  const secret = process.env.SYNC_WORKER_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SYNC_WORKER_SECRET is required in production. Set it or the sync worker cannot be dispatched."
      );
    }
    await processSyncRun(runId);
    return;
  }

  try {
    const response = await fetch(`${getSyncWorkerBaseUrl()}/api/internal/sync/worker`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ runId }),
    });

    if (!response.ok) {
      console.error(
        `[sync-queue] worker dispatch failed (${response.status}) for run ${runId}`
      );
    }
  } catch (error) {
    console.error(`[sync-queue] worker dispatch error for run ${runId}:`, error);
  }
}

function timingSafeStringEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function isSyncWorkerAuthorized(request: Request) {
  const secret = process.env.SYNC_WORKER_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const auth = request.headers.get("authorization");
  if (!auth) return false;

  if (timingSafeStringEqual(auth, `Bearer ${secret}`)) {
    return true;
  }

  const cronSecret = process.env.CRON_SECRET?.trim();
  return Boolean(cronSecret && timingSafeStringEqual(auth, `Bearer ${cronSecret}`));
}
