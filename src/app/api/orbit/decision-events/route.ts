import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";
import { invalidateUserResponseCache } from "@/lib/upstash-cache";
import {
  recordOrbitDecisionEvents,
  OrbitDecisionEventOwnershipError,
} from "@/lib/orbit-decision-events";
import {
  orbitBookmarkSuggestionSchema,
  orbitCollectionSuggestionSchema,
  orbitTagSuggestionSchema,
} from "@/lib/orbit-grok";
import type { OrbitDecisionEventPayload } from "@/types";

const MAX_DECISION_EVENTS_BODY_BYTES = 64 * 1024;

const orbitDecisionEventSuggestionSchema = orbitBookmarkSuggestionSchema.extend({
  bookmarkId: z.string().trim().min(1).max(128),
  tags: z.array(orbitTagSuggestionSchema).max(3),
  collection: z.union([orbitCollectionSuggestionSchema, z.null()]),
});

const orbitDecisionEventSchema = z.object({
  bookmarkId: z.string().trim().min(1).max(128),
  action: z.enum(["accepted", "edited", "kept", "rejected"]),
  source: z.string().trim().max(80).nullable().optional(),
  mode: z.string().trim().max(40).nullable().optional(),
  originalSuggestion: orbitDecisionEventSuggestionSchema.nullable().optional(),
  reviewedSuggestion: orbitDecisionEventSuggestionSchema.nullable().optional(),
});

const orbitDecisionEventsRequestSchema = z.object({
  events: z.array(orbitDecisionEventSchema).min(1).max(100),
});

async function assertOwnedBookmarkIds(userId: string, bookmarkIds: string[]) {
  const uniqueIds = Array.from(new Set(bookmarkIds));
  const owned = await prisma.bookmark.findMany({
    where: {
      userId,
      id: { in: uniqueIds },
    },
    select: { id: true },
  });

  return owned.length === uniqueIds.length;
}

export async function POST(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(req, MAX_DECISION_EVENTS_BODY_BYTES);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const parsed = orbitDecisionEventsRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const ownsAllBookmarks = await assertOwnedBookmarkIds(
    user.id,
    parsed.data.events.map((event) => event.bookmarkId)
  );
  if (!ownsAllBookmarks) {
    return NextResponse.json(
      { error: "One or more bookmarks could not be found." },
      { status: 404 }
    );
  }

  let result: Awaited<ReturnType<typeof recordOrbitDecisionEvents>>;
  try {
    result = await recordOrbitDecisionEvents({
      userId: user.id,
      events: parsed.data.events as OrbitDecisionEventPayload[],
    });
  } catch (error) {
    if (error instanceof OrbitDecisionEventOwnershipError) {
      return NextResponse.json(
        { error: "One or more bookmarks could not be found." },
        { status: 404 }
      );
    }
    throw error;
  }

  await invalidateUserResponseCache(user.id);

  return NextResponse.json({ ok: true, ...result });
}
