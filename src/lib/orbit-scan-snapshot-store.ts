import "server-only";

import { Prisma } from "@prisma/client";

import {
  parseOrbitScanSnapshotRaw,
  type OrbitScanSnapshot,
} from "@/lib/orbit-scan-snapshot";
import { prisma } from "@/lib/prisma";

function toPrismaJson(value: OrbitScanSnapshot): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Load the durable scan snapshot for `userId`. Corrupt rows are deleted so
 * they never retry, matching sessionStorage behavior.
 */
export async function loadOrbitScanSnapshotForUser(
  userId: string
): Promise<OrbitScanSnapshot | null> {
  const row = await prisma.orbitScanSnapshot.findUnique({
    where: { userId },
    select: { snapshot: true },
  });
  if (!row) return null;

  const snapshot = parseOrbitScanSnapshotRaw(JSON.stringify(row.snapshot), userId);
  if (snapshot) return snapshot;

  await prisma.orbitScanSnapshot.deleteMany({ where: { userId } });
  return null;
}

export async function saveOrbitScanSnapshotForUser(
  snapshot: OrbitScanSnapshot
): Promise<void> {
  const savedAt = new Date(snapshot.savedAt);
  const data = {
    snapshot: toPrismaJson(snapshot),
    savedAt: Number.isNaN(savedAt.getTime()) ? new Date() : savedAt,
  };

  await prisma.orbitScanSnapshot.upsert({
    where: { userId: snapshot.userId },
    create: { userId: snapshot.userId, ...data },
    update: data,
  });
}

export async function deleteOrbitScanSnapshotForUser(
  userId: string
): Promise<void> {
  await prisma.orbitScanSnapshot.deleteMany({ where: { userId } });
}
