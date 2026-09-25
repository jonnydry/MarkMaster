import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { driveOrbitLibraryRun } from "@/lib/orbit-library-classify";
import { isSyncWorkerAuthorized } from "@/lib/sync-queue";

export const maxDuration = 240;

const workerBodySchema = z.object({
  runId: z.string().trim().min(1),
});

/** Runs the next budgeted slice of an auto-tag run, then hands off again. */
export async function POST(req: NextRequest) {
  if (!isSyncWorkerAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = workerBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Failures are written to the run itself; the caller only needs a hand-off.
  await driveOrbitLibraryRun(parsed.data.runId);
  return NextResponse.json({ ok: true });
}
