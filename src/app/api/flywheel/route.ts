import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";

/**
 * Phase 3 Item 12 Slice 1: Minimal ingest for flywheel events.
 * - Authenticated per-user
 * - Uses existing "api:write" rate limit (lightweight writes)
 * - Best-effort: on any error we still 202 so client never sees friction
 * - Payload is flexible JSON for future Slice 2 extensibility (e.g. sources, sizes)
 */

export async function POST(request: Request) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit("api:write", user.id);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }

  try {
    const { eventType, payload } = await request.json().catch(() => ({}));

    if (!eventType || typeof eventType !== "string") {
      return NextResponse.json({ error: "Invalid eventType" }, { status: 400 });
    }

    await prisma.flywheelEvent.create({
      data: {
        userId: user.id,
        eventType,
        payload: payload ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Fail open: instrumentation must never degrade the elegant experience.
    // We still accept (202) so beacons don't retry storm.
    console.warn("[flywheel] ingest error (non-fatal)", err);
    return NextResponse.json({ ok: false }, { status: 202 });
  }
}
