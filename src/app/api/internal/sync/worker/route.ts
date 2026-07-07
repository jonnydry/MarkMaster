import { NextRequest, NextResponse } from "next/server";

import {
  isSyncWorkerAuthorized,
  processPendingSyncRuns,
  processSyncRun,
} from "@/lib/sync-queue";

/** Dedicated invocation budget for long-running sync work. */
export const maxDuration = 300;

async function handleWorkerRequest(req: NextRequest) {
  if (!isSyncWorkerAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Vercel Cron invokes this route via GET without a body. Only parse JSON
  // on POST so callers can target a specific runId; GET always drains pending.
  let runId: string | undefined;
  if (req.method === "POST") {
    try {
      const body = (await req.json()) as { runId?: string };
      runId = body.runId;
    } catch {
      runId = undefined;
    }
  }

  if (runId) {
    const result = await processSyncRun(runId);
    return NextResponse.json(result);
  }

  const results = await processPendingSyncRuns(3);
  return NextResponse.json({
    drained: results.filter((result) => result.processed).length,
    results,
  });
}

export async function GET(req: NextRequest) {
  return handleWorkerRequest(req);
}

export async function POST(req: NextRequest) {
  return handleWorkerRequest(req);
}
