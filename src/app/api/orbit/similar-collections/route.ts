import { NextRequest, NextResponse } from "next/server";

import { getDbUser } from "@/lib/auth";
import type { SimilarCollectionsData } from "@/lib/orbit-similar-collections";
import { getSimilarCollections } from "@/lib/orbit-similar-collections";

/**
 * Lightweight GET for similar high-performers in overlapping collections/tags.
 * Returns SimilarCollectionsData (array or null). Triggered on-demand from
 * the review edit sheet when it opens. Authenticated.
 */
export async function GET(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const bookmarkId = searchParams.get("bookmarkId");

  if (!bookmarkId) {
    return NextResponse.json(
      { error: "bookmarkId query param is required" },
      { status: 400 }
    );
  }

  const data: SimilarCollectionsData = await getSimilarCollections(
    user.id,
    bookmarkId
  );
  return NextResponse.json(data);
}
