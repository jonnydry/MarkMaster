import { NextResponse } from "next/server";

import { getDbUser } from "@/lib/auth";
import {
  ORBIT_SCAN_SNAPSHOT_MAX_CHARS,
  parseOrbitScanSnapshotInput,
} from "@/lib/orbit-scan-snapshot";
import {
  deleteOrbitScanSnapshotForUser,
  loadOrbitScanSnapshotForUser,
  saveOrbitScanSnapshotForUser,
} from "@/lib/orbit-scan-snapshot-store";
import { checkRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { readJsonBody } from "@/lib/request-body";

const MAX_SNAPSHOT_BODY_BYTES = Math.max(
  ORBIT_SCAN_SNAPSHOT_MAX_CHARS,
  512 * 1024
);

async function requireSnapshotUser() {
  const user = await getDbUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const rateLimitResult = await checkRateLimit("orbit:snapshot", user.id);
  if (!rateLimitResult.success) {
    return { user: null, response: createRateLimitResponse(rateLimitResult) };
  }

  return { user, response: null };
}

export async function GET() {
  const { user, response } = await requireSnapshotUser();
  if (!user) return response;

  const snapshot = await loadOrbitScanSnapshotForUser(user.id);
  return NextResponse.json({ snapshot });
}

export async function PUT(request: Request) {
  const { user, response } = await requireSnapshotUser();
  if (!user) return response;

  const body = await readJsonBody(request, MAX_SNAPSHOT_BODY_BYTES);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const parsed = parseOrbitScanSnapshotInput(body.data, user.id);
  if (!parsed.ok) {
    return NextResponse.json(
      {
        error:
          parsed.reason === "too_large"
            ? "Scan snapshot is too large to persist"
            : "Invalid scan snapshot",
      },
      { status: parsed.reason === "too_large" ? 413 : 400 }
    );
  }

  await saveOrbitScanSnapshotForUser(parsed.snapshot);
  return NextResponse.json({ snapshot: parsed.snapshot });
}

export async function DELETE() {
  const { user, response } = await requireSnapshotUser();
  if (!user) return response;

  await deleteOrbitScanSnapshotForUser(user.id);
  return NextResponse.json({ ok: true });
}
