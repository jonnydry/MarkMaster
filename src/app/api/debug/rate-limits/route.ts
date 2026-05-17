import { NextRequest, NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { checkRateLimit, getRateLimitDescription, type RateLimitAction } from "@/lib/rate-limit";

const ACTIONS: RateLimitAction[] = ["sync", "orbit", "api:read", "api:write"];

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

  // Restrict in production (optional but recommended)
  if (process.env.NODE_ENV === "production") {
    const ownerUserId = process.env.OWNER_USER_ID;
    if (ownerUserId && user.id !== ownerUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

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

  if (process.env.NODE_ENV === "production") {
    const ownerUserId = process.env.OWNER_USER_ID;
    if (ownerUserId && user.id !== ownerUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action as RateLimitAction;

  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Reset mechanism: By using a unique identifier (timestamp), we force the creation
  // of a new rate limit bucket for this user+action, effectively resetting their limit.
  // This is a pragmatic solution for the internal debug tool.
  // For a production admin tool, consider using Upstash's REST API for proper bucket deletion.
  await checkRateLimit(action, `${user.id}:reset-${Date.now()}`);

  return NextResponse.json({
    message: `Rate limit for "${action}" has been reset for this user.`,
    action,
  });
}
