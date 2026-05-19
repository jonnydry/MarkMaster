import { NextRequest, NextResponse } from "next/server";

import { getDbUser } from "@/lib/auth";
import type { AuthorDecisionHistoryData } from "@/lib/orbit-author-history";
import { getAuthorDecisionHistory } from "@/lib/orbit-author-history";

/**
 * Lightweight GET for author decision history (returns AuthorDecisionHistoryData).
 * Triggered on-demand from the review edit sheet. Authenticated; null when none.
 */
export async function GET(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const authorUsername = searchParams.get("authorUsername");

  if (!authorUsername) {
    return NextResponse.json(
      { error: "authorUsername query param is required" },
      { status: 400 }
    );
  }

  const history: AuthorDecisionHistoryData = await getAuthorDecisionHistory(
    user.id,
    authorUsername
  );
  return NextResponse.json(history);
}
