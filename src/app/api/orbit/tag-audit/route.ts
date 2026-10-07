import { NextRequest, NextResponse } from "next/server";

import { getDbUser } from "@/lib/auth";
import { logError } from "@/lib/logger";
import { ORBIT_SCAN_DEADLINE_MARGIN_MS } from "@/lib/orbit-config";
import { OrbitScanError } from "@/lib/orbit-grok-schemas";
import {
  OrbitTagAuditError,
  readOrbitTagAudit,
  runOrbitTagAudit,
  tagAuditCoverageSentence,
  type TagAuditView,
} from "@/lib/orbit-tag-audit";
import { checkGlobalRateLimit, checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { readJsonBody } from "@/lib/request-body";

export const maxDuration = 240;

const RUN_BUDGET_MS = 240_000;

function viewJson(view: TagAuditView | null) {
  if (!view) return NextResponse.json(null);
  return NextResponse.json({
    ...view,
    coverageSentence: tagAuditCoverageSentence(view.coverage),
  });
}

function errorResponse(error: unknown) {
  if (error instanceof OrbitTagAuditError || error instanceof OrbitScanError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  logError("orbit", "tag audit failed unexpectedly", error);
  return NextResponse.json(
    { error: "Tag audit failed unexpectedly." },
    { status: 500 },
  );
}

export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return viewJson(await readOrbitTagAudit({ userId: user.id }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  const deadlineMs = Date.now() + RUN_BUDGET_MS - ORBIT_SCAN_DEADLINE_MARGIN_MS;
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonBody(req);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const [rateLimitResult, globalResult] = await Promise.all([
    checkRateLimit("orbit", user.id),
    checkGlobalRateLimit("orbit"),
  ]);
  if (!rateLimitResult.success) return createRateLimitResponse(rateLimitResult);
  if (!globalResult.success) return createRateLimitResponse(globalResult);

  try {
    const view = await runOrbitTagAudit({
      userId: user.id,
      deadlineMs,
    });
    return viewJson(view);
  } catch (error) {
    return errorResponse(error);
  }
}
