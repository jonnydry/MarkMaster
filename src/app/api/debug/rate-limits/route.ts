import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { debugAccessDeniedResponse } from "@/lib/debug-access";
import { readJsonBody } from "@/lib/request-body";
import {
  checkRateLimit,
  getRateLimitDescription,
  resetUserRateLimit,
  DEBUG_RATE_LIMIT_ACTIONS,
  type DebugRateLimitAction,
} from "@/lib/rate-limit";

const ACTIONS = DEBUG_RATE_LIMIT_ACTIONS;

/**
 * Debug endpoint to view current rate limit status for the logged-in user.
 * Useful during development and testing.
 *
 * Supports resetting limits via POST for easier testing.
 */
export async function GET() {
  const user = await getDbUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const denied = debugAccessDeniedResponse(user);
  if (denied) return denied;

  const results = await Promise.all(
    ACTIONS.map(async (action) => {
      const result = await checkRateLimit(action, user.id);
      const resetDate = new Date(result.reset);
      const now = Date.now();

      return {
        action,
        description: getRateLimitDescription(action),
        ...result,
        resetInSeconds: result.reset > now ? Math.ceil((result.reset - now) / 1000) : 0,
        resetAt: resetDate.toISOString(),
      };
    })
  );

  return NextResponse.json({
    userId: user.id,
    timestamp: new Date().toISOString(),
    limits: results,
  });
}

/**
 * Allow resetting a specific rate limit (very useful during development/testing).
 * POST body: { action: "sync" | "orbit" | "api:read" | "api:write" }
 */
export async function POST(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const denied = debugAccessDeniedResponse(user);
  if (denied) return denied;

  const body = await readJsonBody(req);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const action =
    typeof body.data === "object" &&
    body.data !== null &&
    "action" in body.data &&
    typeof body.data.action === "string"
      ? body.data.action
      : undefined;

  if (!action || !ACTIONS.includes(action as DebugRateLimitAction)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const reset = await resetUserRateLimit(action as DebugRateLimitAction, user.id);
  if (!reset.ok) {
    return NextResponse.json(
      { error: reset.message ?? "Reset failed" },
      { status: 503 }
    );
  }

  return NextResponse.json({
    message: `Rate limit for "${action}" has been reset for this user.`,
    action,
  });
}
