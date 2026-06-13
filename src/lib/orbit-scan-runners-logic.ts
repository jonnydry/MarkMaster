import { sameBookmarkIds } from "@/lib/bookmark-batch-utils";
import type { OrbitScanRequest } from "@/lib/orbit-page-types";

export function isStaleScanPlan(args: {
  hasPlan: boolean;
  scanContextAtLastRun: string | null;
  currentScanContextKey: string;
}): boolean {
  return Boolean(
    args.hasPlan &&
      args.scanContextAtLastRun &&
      args.scanContextAtLastRun !== args.currentScanContextKey
  );
}

export function canRescanCurrentSelection(args: {
  hasScanError: boolean;
  selectedScanTargetIds: string[];
  lastScanRequest: OrbitScanRequest | null;
}): boolean {
  return Boolean(
    args.hasScanError &&
      args.selectedScanTargetIds.length > 0 &&
      !(
        args.lastScanRequest?.scanningSelection &&
        sameBookmarkIds(
          args.lastScanRequest.targetIds,
          args.selectedScanTargetIds
        )
      )
  );
}
