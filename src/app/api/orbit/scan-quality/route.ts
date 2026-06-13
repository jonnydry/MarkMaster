import { NextResponse } from "next/server";

import { getDbUser } from "@/lib/auth";
import { evaluateOrbitScanQuality } from "@/lib/orbit-scan-quality";
import { prisma } from "@/lib/prisma";

const SCAN_EVENT_TYPES = ["orbit.scan.completed", "orbit.scan.failed"] as const;
const REVIEW_EVENT_TYPE = "orbit.review.applied";

export async function GET() {
  const user = await getDbUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [scanEvents, reviewEvents] = await Promise.all([
      prisma.flywheelEvent.findMany({
        where: {
          userId: user.id,
          eventType: { in: [...SCAN_EVENT_TYPES] },
        },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: { eventType: true, payload: true },
      }),
      prisma.flywheelEvent.findMany({
        where: {
          userId: user.id,
          eventType: REVIEW_EVENT_TYPE,
        },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: { payload: true },
      }),
    ]);

    return NextResponse.json(
      evaluateOrbitScanQuality({ scanEvents, reviewEvents })
    );
  } catch (err) {
    console.warn("[orbit] scan quality query failed:", err);
    return NextResponse.json(
      evaluateOrbitScanQuality({ scanEvents: [], reviewEvents: [] })
    );
  }
}
