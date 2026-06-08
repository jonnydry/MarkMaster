import type { OrbitScanRequest } from "@/lib/orbit-page-types";
import {
  buildFallbackBatchMetadata,
  buildOrbitScanContextKey,
  profileForCount,
} from "@/lib/orbit-scan-batch-utils";
import type { OrbitScanBatchMode } from "@/lib/orbit-config";
import type { OrbitView } from "@/lib/orbit-navigation";
import type { OrbitScanBatchMetadata } from "@/types";

export type BuildOrbitScanRequestArgs = {
  targetIds: string[];
  scanSelection: boolean;
  batchMetadata?: OrbitScanBatchMetadata;
  orbitView: OrbitView;
  page: number;
  queryString: string;
  resolvedScanBatchMode: OrbitScanBatchMode;
};

export function buildOrbitScanRequest(args: BuildOrbitScanRequestArgs): OrbitScanRequest {
  const {
    targetIds,
    scanSelection,
    batchMetadata,
    orbitView,
    page,
    queryString,
    resolvedScanBatchMode,
  } = args;

  const batch =
    batchMetadata ??
    buildFallbackBatchMetadata({
      targetIds,
      mode: resolvedScanBatchMode,
      profile: profileForCount(targetIds.length),
    });

  return {
    targetIds,
    scanningSelection: scanSelection,
    batch,
    contextKey: buildOrbitScanContextKey({
      orbitView,
      page,
      queryString,
      scanningSelection: scanSelection,
      scanTargetIds: targetIds,
      batchMode: batch.mode,
      batchProfile: batch.profile,
    }),
  };
}
