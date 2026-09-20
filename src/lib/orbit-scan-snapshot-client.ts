import { sendJson } from "@/lib/fetch-json";
import {
  buildOrbitScanSnapshotRaw,
  orbitScanSnapshotGetResponseSchema,
  parseOrbitScanSnapshotRaw,
  type BuildOrbitScanSnapshotArgs,
  type OrbitScanSnapshot,
} from "@/lib/orbit-scan-snapshot";

const SNAPSHOT_PATH = "/api/orbit/scan-snapshot";

export async function fetchOrbitScanSnapshotFromServer(
  userId: string
): Promise<OrbitScanSnapshot | null> {
  const response = await sendJson(SNAPSHOT_PATH, {
    method: "GET",
    schema: orbitScanSnapshotGetResponseSchema,
  });
  if (!response.snapshot) return null;
  return parseOrbitScanSnapshotRaw(JSON.stringify(response.snapshot), userId);
}

export async function saveOrbitScanSnapshotToServer(
  args: BuildOrbitScanSnapshotArgs
): Promise<void> {
  const raw = buildOrbitScanSnapshotRaw(args);
  if (!raw) return;
  await sendJson(SNAPSHOT_PATH, {
    method: "PUT",
    body: JSON.parse(raw),
  });
}

export async function clearOrbitScanSnapshotOnServer(): Promise<void> {
  await sendJson(SNAPSHOT_PATH, { method: "DELETE" });
}
