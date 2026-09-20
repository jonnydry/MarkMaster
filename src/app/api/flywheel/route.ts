import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getDbUser } from "@/lib/auth";
import { flywheelEventSchema } from "@/lib/flywheel-event-schema";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";
import { logWarn } from "@/lib/logger";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";

const MAX_FLYWHEEL_BODY_BYTES = 8 * 1024;

/**
 * Phase 3 Item 12 Slice 1: Minimal ingest for flywheel events.
 * - Authenticated per-user
 * - Best-effort: on any error we still 202 so client never sees friction
 * - Payload is flexible JSON for future Slice 2 extensibility (e.g. sources, sizes)
 */

export async function POST(request: Request) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Exempt from the proxy's api:write debit (lightweight route), so this
  // dedicated bucket is the only per-user cap on FlywheelEvent inserts.
  const rateLimitResult = await checkRateLimit("flywheel", user.id);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }

  try {
    const body = await readJsonBody(request, MAX_FLYWHEEL_BODY_BYTES);
    if (!body.ok) {
      return NextResponse.json({ error: body.error }, { status: body.status });
    }

    const parsed = flywheelEventSchema.safeParse(body.data);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid event",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    await prisma.flywheelEvent.create({
      data: {
        userId: user.id,
        eventType: parsed.data.eventType,
        payload:
          parsed.data.payload === null || parsed.data.payload === undefined
            ? Prisma.JsonNull
            : parsed.data.payload,
      },
    });

    // Deliberately no response-cache invalidation (Speed-H1): flywheel events
    // are telemetry only read by /api/orbit/scan-quality, which queries
    // Prisma directly and never goes through the versioned response cache.
    // Bumping the per-user cache version here nuked the analytics/graph/scan
    // caches on every ingested event — including the scan cache the
    // just-completed scan had filled.

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Fail open: instrumentation must never degrade the elegant experience.
    // We still accept (202) so beacons don't retry storm.
    logWarn("flywheel", "ingest error (non-fatal)", err);
    return NextResponse.json({ ok: false }, { status: 202 });
  }
}
