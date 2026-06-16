import { NextRequest, NextResponse } from "next/server";

import { getDbUser } from "@/lib/auth";
import { getOrbitXaiRuntimeStatus } from "@/lib/orbit-grok";
import type { OrbitScanFailureCode } from "@/types";

function parseRecoverableOrbitFailure(
  value: string | null
): OrbitScanFailureCode | null {
  return value === "xai_auth" || value === "xai_model" ? value : null;
}

export async function GET(req: NextRequest) {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lastFailureCode = parseRecoverableOrbitFailure(
    req.nextUrl.searchParams.get("lastFailure")
  );

  return NextResponse.json(getOrbitXaiRuntimeStatus({ lastFailureCode }), {
    headers: {
      "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
    },
  });
}
