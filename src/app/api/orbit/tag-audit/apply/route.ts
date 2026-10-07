import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDbUser } from "@/lib/auth";
import { logError } from "@/lib/logger";
import { OrbitScanError } from "@/lib/orbit-grok-schemas";
import { applyOrbitTagAudit, OrbitTagAuditError } from "@/lib/orbit-tag-audit";
import { readJsonBody } from "@/lib/request-body";
import { invalidateUserResponseCache } from "@/lib/upstash-cache";

const applyBodySchema = z.object({
  auditId: z.string().trim().min(1).max(128),
  checkedProposalIds: z.array(z.string().trim().min(1).max(128)).max(100),
});

function errorResponse(error: unknown) {
  if (error instanceof OrbitTagAuditError || error instanceof OrbitScanError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  logError("orbit", "tag audit apply failed unexpectedly", error);
  return NextResponse.json(
    { error: "Tag audit apply failed unexpectedly." },
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
  const parsed = applyBodySchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const result = await applyOrbitTagAudit({
      userId: user.id,
      auditId: parsed.data.auditId,
      checkedProposalIds: parsed.data.checkedProposalIds,
    });
    await invalidateUserResponseCache(user.id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
