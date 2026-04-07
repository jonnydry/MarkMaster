import { NextResponse } from "next/server";
import { getDbUser } from "@/lib/auth";
import { syncBookmarks } from "@/lib/sync";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = checkRateLimit(`sync:${user.id}`);
  if (!rate.allowed) {
    return rateLimitResponse(rate.resetAt);
  }

  try {
    const result = await syncBookmarks(user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
