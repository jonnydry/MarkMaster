import { NextResponse } from "next/server";

import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * Unauthenticated liveness/readiness probe for uptime monitors and load
 * balancers. Exempt from all rate limiting in src/proxy.ts. Intentionally
 * reports only a coarse ok/degraded signal — no versions, env, or internals.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logError("Health", "Database check failed", error);
    return NextResponse.json(
      { status: "degraded" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
