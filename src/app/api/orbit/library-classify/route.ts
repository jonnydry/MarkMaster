import { after, NextResponse } from "next/server";

import { getDbUser } from "@/lib/auth";
import {
  classifyOrbitLibraryRun,
  countOrbitLibraryQueue,
  kickOrbitLibraryClassifyWorker,
} from "@/lib/orbit-library-classify";
import { OrbitGrokError } from "@/lib/orbit-grok";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import type { OrbitScanErrorPayload } from "@/types";

export const maxDuration = 240;

export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const untaggedCount = await countOrbitLibraryQueue(user.id);
  return NextResponse.json({ untaggedCount });
}

export async function POST() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit("orbit:library", user.id);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }

  try {
    const result = await classifyOrbitLibraryRun({
      userId: user.id,
      continueInBackground: false,
    });

    if (result.remaining > 0 && result.cursor && (result.pagesLeft ?? 0) > 0) {
      after(() =>
        kickOrbitLibraryClassifyWorker({
          userId: user.id,
          cursor: result.cursor,
          pagesLeft: result.pagesLeft,
        })
      );
    }

    return NextResponse.json({
      processed: result.processed,
      applied: result.applied,
      skippedReview: result.skippedReview,
      remaining: result.remaining,
      continued: result.remaining > 0,
      queueCount: result.queueCount,
    });
  } catch (error) {
    if (error instanceof OrbitGrokError) {
      const payload: OrbitScanErrorPayload = {
        error: error.message,
        code: error.code,
      };
      return NextResponse.json(payload, { status: error.status });
    }

    return NextResponse.json(
      { error: "Library classify failed unexpectedly." },
      { status: 500 }
    );
  }
}
