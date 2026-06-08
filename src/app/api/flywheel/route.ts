import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";

const MAX_FLYWHEEL_BODY_BYTES = 8 * 1024;
const flywheelPayloadValueSchema = z.union([
  z.string().trim().max(240),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const flywheelEventSchema = z.object({
  eventType: z.enum([
    "cta.review_in_orbit",
    "cta.digest_review_together",
    "feedback.good",
    "feedback.not_relevant",
    "mode.quick",
    "mode.deep",
    "digest.session_start",
    "quick.keep",
    "orbit.scan.completed",
    "orbit.scan.failed",
    "orbit.review.applied",
  ]),
  payload: z
    .record(z.string().trim().min(1).max(40), flywheelPayloadValueSchema)
    .superRefine((value, ctx) => {
      if (Object.keys(value).length > 24) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Payload has too many fields",
        });
      }
    })
    .nullable()
    .optional(),
});

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

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Fail open: instrumentation must never degrade the elegant experience.
    // We still accept (202) so beacons don't retry storm.
    console.warn("[flywheel] ingest error (non-fatal)", err);
    return NextResponse.json({ ok: false }, { status: 202 });
  }
}
