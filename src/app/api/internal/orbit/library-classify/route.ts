import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ORBIT_LIBRARY_CLASSIFY_MAX_PAGES } from "@/lib/orbit-config";
import { classifyOrbitLibraryRun } from "@/lib/orbit-library-classify";
import { OrbitGrokError } from "@/lib/orbit-grok";
import { isSyncWorkerAuthorized } from "@/lib/sync-queue";

export const maxDuration = 240;

const workerBodySchema = z.object({
  userId: z.string().trim().min(1),
  pagesLeft: z.number().int().min(0).max(ORBIT_LIBRARY_CLASSIFY_MAX_PAGES).optional(),
  cursor: z
    .object({
      bookmarkedAt: z.string().trim().min(1),
      id: z.string().trim().min(1),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  if (!isSyncWorkerAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = workerBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const result = await classifyOrbitLibraryRun({
      userId: parsed.data.userId,
      cursor: parsed.data.cursor,
      pagesLeft: parsed.data.pagesLeft,
      continueInBackground: true,
    });

    return NextResponse.json({
      processed: result.processed,
      applied: result.applied,
      skippedReview: result.skippedReview,
      remaining: result.remaining,
      continued: result.continued,
    });
  } catch (error) {
    if (error instanceof OrbitGrokError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { error: "Library classify worker failed." },
      { status: 500 }
    );
  }
}
