import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDbUser } from "@/lib/auth";
import { logError } from "@/lib/logger";
import { OrbitScanError } from "@/lib/orbit-grok-schemas";
import { OrbitTagAuditError, undoOrbitTagAudit } from "@/lib/orbit-tag-audit";
import { readJsonBody } from "@/lib/request-body";
import { invalidateUserResponseCache } from "@/lib/upstash-cache";

const undoBodySchema = z.object({
  auditId: z.string().trim().min(1).max(128),
});

function errorResponse(error: unknown) {
  if (error instanceof OrbitTagAuditError || error instanceof OrbitScanError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  logError("orbit", "tag audit undo failed unexpectedly", error);
  return NextResponse.json(
    { error: "Tag audit undo failed unexpectedly." },
    { status: 500 },
  );
}

export async function POST(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(req);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  const parsed = undoBodySchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const result = await undoOrbitTagAudit({
      userId: user.id,
      auditId: parsed.data.auditId,
    });
    await invalidateUserResponseCache(user.id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
