import { after, NextResponse } from "next/server";

import { getDbUser } from "@/lib/auth";
import {
  cancelOrbitLibraryRun,
  countOrbitLibraryQueue,
  createOrbitLibraryRun,
  driveOrbitLibraryRun,
  getLatestOrbitLibraryRun,
  isOrbitLibraryRunResumable,
  isOrbitLibraryRunStale,
  resumeOrbitLibraryRun,
  toOrbitLibraryRunView,
} from "@/lib/orbit-library-classify";
import { OrbitScanError } from "@/lib/orbit-grok";
import { logError } from "@/lib/logger";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import type { OrbitLibraryStatusPayload, OrbitScanErrorPayload } from "@/types";

/** The first worker slice runs in `after()` under this budget. */
export const maxDuration = 240;

/** Mutations skip the queue count; the client refetches it once a run ends. */
function statusPayload(
  run: Parameters<typeof toOrbitLibraryRunView>[0] | null
): OrbitLibraryStatusPayload {
  return { untaggedCount: null, run: run ? toOrbitLibraryRunView(run) : null };
}

/** Current auto-tag run (polled while one is active) plus the untagged count. */
export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit("orbit:progress", user.id);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }

  const run = await getLatestOrbitLibraryRun(user.id);
  const active = run?.status === "RUNNING";
  const payload: OrbitLibraryStatusPayload = {
    untaggedCount: active ? null : await countOrbitLibraryQueue(user.id),
    run: run ? toOrbitLibraryRunView(run) : null,
  };
  return NextResponse.json(payload);
}

/**
 * Starts auto-tagging the Orbit queue and returns at once; the worker runs
 * after the response. Idempotent while a run is live, and resumes a run that
 * stalled or failed from where it stopped.
 */
export async function POST() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const latest = await getLatestOrbitLibraryRun(user.id);
    if (latest?.status === "RUNNING" && !isOrbitLibraryRunStale(latest)) {
      return NextResponse.json(statusPayload(latest));
    }

    const rateLimitResult = await checkRateLimit("orbit:library", user.id);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult);
    }

    const resuming = Boolean(latest && isOrbitLibraryRunResumable(latest));
    const run =
      resuming && latest
        ? await resumeOrbitLibraryRun(latest.id)
        : await createOrbitLibraryRun(user.id);
    if (!run) {
      const payload: OrbitLibraryStatusPayload = { untaggedCount: 0, run: null };
      return NextResponse.json(payload);
    }

    after(async () => {
      try {
        await driveOrbitLibraryRun(run.id);
      } catch (error) {
        logError("OrbitLibrary", `Library run ${run.id} could not continue`, error);
      }
    });

    return NextResponse.json(statusPayload(run), {
      status: resuming ? 200 : 201,
    });
  } catch (error) {
    if (error instanceof OrbitScanError) {
      const payload: OrbitScanErrorPayload = {
        error: error.message,
        code: error.code,
      };
      return NextResponse.json(payload, { status: error.status });
    }

    logError("OrbitLibrary", "Library run could not start", error);
    return NextResponse.json(
      { error: "Auto-tag could not start." },
      { status: 500 }
    );
  }
}

/**
 * Stops the active run after the page in flight, or dismisses a failed one.
 * Tags already applied stay.
 */
export async function DELETE() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await cancelOrbitLibraryRun(user.id);
  return NextResponse.json(statusPayload(run));
}
