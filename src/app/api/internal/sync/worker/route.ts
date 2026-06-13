import { NextRequest, NextResponse } from "next/server";

import {
  isSyncWorkerAuthorized,
  processPendingSyncRuns,
  processSyncRun,
} from "@/lib/sync-queue";

/** Dedicated invocation budget for long-running sync work. */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!isSyncWorkerAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let runId: string | undefined;
  try {
    const body = (await req.json()) as { runId?: string };
    runId = body.runId;
  } catch {
    runId = undefined;
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
