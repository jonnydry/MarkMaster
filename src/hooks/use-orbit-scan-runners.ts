"use client";

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import { sameBookmarkIds } from "@/lib/bookmark-batch-utils";
import { formatAppliedToast } from "@/lib/orbit-apply-utils";
import type { OrbitScanRequest } from "@/lib/orbit-page-types";
import { batchMetadataFromPlan } from "@/lib/orbit-scan-batch-utils";
import {
  buildOrbitScanRequest,
  type BuildOrbitScanRequestArgs,
} from "@/lib/orbit-scan-request";
import type { useOrbitScan } from "@/hooks/use-orbit-scan";
import type { OrbitScanBatchMode, OrbitScanBatchProfileId } from "@/lib/orbit-config";
import type { OrbitView } from "@/lib/orbit-navigation";
import type { OrbitScanBatchMetadata } from "@/types";

type OrbitScanApi = ReturnType<typeof useOrbitScan>;

type UseOrbitScanRunnersOptions = {
  scan: OrbitScanApi;
  orbitView: OrbitView;
  page: number;
  queryString: string;
  resolvedScanBatchMode: OrbitScanBatchMode;
  scanningSelection: boolean;
  scanTargetIds: string[];
  scanBatchMetadata: OrbitScanBatchMetadata;
  selectedScanTargetIds: string[];
  selectedScanPlan: ReturnType<
    typeof import("@/lib/orbit-batch-planner").planOrbitScanBatch
  >;
  scanBatchProfile: OrbitScanBatchProfileId;
  currentScanContextKey: string;
  setAppliedBookmarkIds: Dispatch<SetStateAction<Set<string>>>;
  onOpenBookmarkReview: (bookmarkId: string) => void;
};

export function useOrbitScanRunners(options: UseOrbitScanRunnersOptions) {
  const {
    scan,
    orbitView,
    page,
    queryString,
    resolvedScanBatchMode,
    scanningSelection,
    scanTargetIds,
    scanBatchMetadata,
    selectedScanTargetIds,
    selectedScanPlan,
    scanBatchProfile,
    currentScanContextKey,
    setAppliedBookmarkIds,
    onOpenBookmarkReview,
  } = options;

  const [scanContextAtLastRun, setScanContextAtLastRun] = useState<string | null>(
    null
  );
  const [lastScanRequest, setLastScanRequest] = useState<OrbitScanRequest | null>(
    null
  );

  const buildScanRequest = useCallback(
    (
      targetIds: string[],
      scanSelection: boolean,
      batchMetadata?: OrbitScanBatchMetadata
    ) =>
      buildOrbitScanRequest({
        targetIds,
        scanSelection,
        batchMetadata,
        orbitView,
        page,
        queryString,
        resolvedScanBatchMode,
      } satisfies BuildOrbitScanRequestArgs),
    [orbitView, page, queryString, resolvedScanBatchMode]
  );

  const staleScanPlan = Boolean(
    scan.plan &&
      scanContextAtLastRun &&
      scanContextAtLastRun !== currentScanContextKey
  );

  const canRescanCurrentSelection = Boolean(
    scan.error &&
      selectedScanTargetIds.length > 0 &&
      !(
        lastScanRequest?.scanningSelection &&
        sameBookmarkIds(lastScanRequest.targetIds, selectedScanTargetIds)
      )
  );

  const clearScanRunState = useCallback(() => {
    setScanContextAtLastRun(null);
    setLastScanRequest(null);
  }, []);

  const runOrbitScan = useCallback(
    async (request: OrbitScanRequest) => {
      if (request.targetIds.length === 0) return null;

      setLastScanRequest(request);

      toast.info(
        request.scanningSelection
          ? "Grok is categorizing your selection — this should be quicker."
          : "Grok is categorizing your queue — large batches can take a minute."
      );
      try {
        const result = await scan.scanNow(request.targetIds, request.batch);
        if (result) {
          setScanContextAtLastRun(request.contextKey);
          const scopeLabel = request.scanningSelection ? "selected" : "Orbit";
          toast.success(
            `Grok categorized ${result.plan.suggestions.length} ${scopeLabel} bookmark${
              result.plan.suggestions.length === 1 ? "" : "s"
            }`
          );
        }
        return result;
      } catch {
        return null;
      }
    },
    [scan]
  );

  const handleScan = useCallback(async () => {
    await runOrbitScan(
      buildScanRequest(scanTargetIds, scanningSelection, scanBatchMetadata)
    );
  }, [
    buildScanRequest,
    runOrbitScan,
    scanTargetIds,
    scanningSelection,
    scanBatchMetadata,
  ]);

  const handleRetryScan = useCallback(async () => {
    await runOrbitScan(
      lastScanRequest ?? buildScanRequest(scanTargetIds, scanningSelection)
    );
  }, [
    buildScanRequest,
    lastScanRequest,
    runOrbitScan,
    scanTargetIds,
    scanningSelection,
  ]);

  const handleRescanCurrentSelection = useCallback(async () => {
    await runOrbitScan(
      buildScanRequest(
        selectedScanTargetIds,
        true,
        batchMetadataFromPlan({
          plan: selectedScanPlan,
          mode: resolvedScanBatchMode,
          profile: scanBatchProfile,
        })
      )
    );
  }, [
    buildScanRequest,
    runOrbitScan,
    selectedScanTargetIds,
    selectedScanPlan,
    resolvedScanBatchMode,
    scanBatchProfile,
  ]);

  const handleApplyStrongMatches = useCallback(async () => {
    try {
      const applied = await scan.applyPlanSubset({
        minConfidence: "high",
        safeExistingOnly: true,
      });
      if (applied) {
        toast.success(`Applied strong matches · ${formatAppliedToast(applied)}`);
      } else {
        toast.message("No reusable strong matches left to apply in this pass.");
      }
    } catch {
      // Inline failure state is rendered near the Orbit scan controls.
    }
  }, [scan]);

  const handleAcceptSuggestion = useCallback(
    async (id: string) => {
      const decision = scan.getDecision(id);
      if (!decision?.primary) {
        onOpenBookmarkReview(id);
        return;
      }
      try {
        const applied = await scan.applySuggestion(id, "primary");
        if (applied) {
          setAppliedBookmarkIds((current) => {
            const next = new Set(current);
            next.add(id);
            return next;
          });
          toast.success(`Applied · ${formatAppliedToast(applied)}`);
        }
      } catch {
        onOpenBookmarkReview(id);
      }
    },
    [scan, onOpenBookmarkReview, setAppliedBookmarkIds]
  );

  return useMemo(
    () => ({
      lastScanRequest,
      staleScanPlan,
      canRescanCurrentSelection,
      buildScanRequest,
      runOrbitScan,
      clearScanRunState,
      handleScan,
      handleRetryScan,
      handleRescanCurrentSelection,
      handleApplyStrongMatches,
      handleAcceptSuggestion,
    }),
    [
      lastScanRequest,
      staleScanPlan,
      canRescanCurrentSelection,
      buildScanRequest,
      runOrbitScan,
      clearScanRunState,
      handleScan,
      handleRetryScan,
      handleRescanCurrentSelection,
      handleApplyStrongMatches,
      handleAcceptSuggestion,
    ]
  );
}
