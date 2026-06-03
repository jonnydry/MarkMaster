import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDbUser } from "@/lib/auth";
import { recordOrbitDecisionEvents } from "@/lib/orbit-decision-events";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import type { OrbitDecisionEventPayload } from "@/types";

const orbitDecisionEventSchema = z.object({
  bookmarkId: z.string().trim().min(1).max(128),
  action: z.enum(["accepted", "edited", "kept", "rejected"]),
  source: z.string().trim().max(80).nullable().optional(),
  mode: z.string().trim().max(40).nullable().optional(),
  originalSuggestion: z.unknown().nullable().optional(),
  reviewedSuggestion: z.unknown().nullable().optional(),
});

const orbitDecisionEventsRequestSchema = z.object({
  events: z.array(orbitDecisionEventSchema).min(1).max(100),
});

export async function POST(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit("api:write", user.id);
  if (!rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult);
  }

  const body = await req.json().catch(() => ({}));
  const parsed = orbitDecisionEventsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const result = await recordOrbitDecisionEvents({
    userId: user.id,
    events: parsed.data.events as OrbitDecisionEventPayload[],
  });

  return NextResponse.json({ ok: true, ...result });
}
