"use client";

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import { applyPrimarySuggestion } from "@/lib/orbit-scan-apply";
import { formatAppliedToast } from "@/lib/orbit-apply-utils";
import {
  canRescanCurrentSelection as computeCanRescanCurrentSelection,
  isStaleScanPlan,
} from "@/lib/orbit-scan-runners-logic";
import type { OrbitScanHandle } from "@/hooks/use-orbit-scan";
import type { OrbitScanRequest } from "@/lib/orbit-page-types";
import { batchMetadataFromPlan } from "@/lib/orbit-scan-batch-utils";
import {
  buildOrbitScanRequest,
  type BuildOrbitScanRequestArgs,
} from "@/lib/orbit-scan-request";
import type { OrbitScanBatchMode, OrbitScanBatchProfileId } from "@/lib/orbit-config";
import type { OrbitView } from "@/lib/orbit-navigation";
import type { OrbitScanBatchMetadata } from "@/types";

type OrbitScanApi = OrbitScanHandle;

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

  const staleScanPlan = isStaleScanPlan({
    hasPlan: Boolean(scan.plan),
    scanContextAtLastRun,
    currentScanContextKey,
  });

  const canRescanCurrentSelection = computeCanRescanCurrentSelection({
    hasScanError: Boolean(scan.error),
    selectedScanTargetIds,
    lastScanRequest,
  });

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
      await applyPrimarySuggestion({
        bookmarkId: id,
        getDecision: scan.getDecision,
        applySuggestion: scan.applySuggestion,
        onApplied: (bookmarkId) => {
          setAppliedBookmarkIds((current) => {
            const next = new Set(current);
            next.add(bookmarkId);
            return next;
          });
        },
        onOpenReview: onOpenBookmarkReview,
      });
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
