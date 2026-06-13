"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { buildOrbitScanContextKey } from "@/lib/orbit-scan-batch-utils";
import {
  deriveOrbitScanBatchState,
  mergeReviewBookmarks,
} from "@/lib/orbit-scan-batch-state";
import { useOrbitFlywheelScan } from "@/hooks/use-orbit-flywheel-scan";
import { useOrbitReviewBridge } from "@/hooks/use-orbit-review-bridge";
import { useOrbitScanRunners } from "@/hooks/use-orbit-scan-runners";
import { useOrbitScan } from "@/hooks/use-orbit-scan";
import { isSafeAutoApplySuggestion } from "@/lib/orbit-decision";
import { fetchJson } from "@/lib/fetch-json";
import {
  orbitScanCandidatesResponseSchema,
  orbitScanQualityPayloadSchema,
} from "@/lib/api-response-schemas";
import type { OrbitScanCandidatesResponse } from "@/lib/orbit-page-types";
import { buildOrbitScanCandidatesQueryString } from "@/lib/orbit-queue-params";
import {
  ORBIT_SCAN_CANDIDATE_POOL_SIZE,
  type OrbitScanBatchMode,
} from "@/lib/orbit-config";
import type { OrbitSortDirection, OrbitView } from "@/lib/orbit-navigation";
import type {
  BookmarkWithRelations,
  OrbitScanQualityPayload,
} from "@/types";

type UseOrbitScanSessionOptions = {
  router: ReturnType<typeof import("next/navigation").useRouter>;
  searchParams: ReturnType<typeof import("next/navigation").useSearchParams>;
  orbitView: OrbitView;
  page: number;
  pageSize: number;
  queryString: string;
  queueSortDirection: OrbitSortDirection;
  deferredSearch: string;
  bookmarks: BookmarkWithRelations[];
  bookmarkById: Map<string, BookmarkWithRelations>;
  queueIsLoading: boolean;
  hasSearchQuery: boolean;
  highlightIdFromUrl: string | null;
  digestIdsFromUrl: string | null;
  sourceFromUrl: string | null;
  selectionMode: boolean;
  selectedBookmarkIds: Set<string>;
  setActiveBookmarkId: (id: string | null) => void;
};

export function useOrbitScanSession(options: UseOrbitScanSessionOptions) {
  const {
    router,
    searchParams,
    orbitView,
    page,
    pageSize,
    queryString,
    queueSortDirection,
    deferredSearch,
    bookmarks,
    bookmarkById,
    queueIsLoading,
    hasSearchQuery,
    highlightIdFromUrl,
    digestIdsFromUrl,
    sourceFromUrl,
    selectionMode,
    selectedBookmarkIds,
    setActiveBookmarkId,
  } = options;

  const scan = useOrbitScan();
  const clearReviewUrlParamsRef = useRef<() => void>(() => {});

  const [appliedBookmarkIds, setAppliedBookmarkIds] = useState<Set<string>>(
    () => new Set()
  );
  const [scanBatchMode, setScanBatchMode] =
    useState<OrbitScanBatchMode>("auto");

  const review = useOrbitReviewBridge({
    scan,
    setActiveBookmarkId,
    onReviewClose: () => clearReviewUrlParamsRef.current(),
  });

  const scanCandidatesQueryString = useMemo(
    () =>
      buildOrbitScanCandidatesQueryString({
        orbitView,
        page,
        pageSize,
        sortDirection: queueSortDirection,
        search: deferredSearch,
        candidateLimit: ORBIT_SCAN_CANDIDATE_POOL_SIZE,
      }),
    [deferredSearch, orbitView, page, pageSize, queueSortDirection]
  );

  const { data: scanCandidatesData } = useQuery<OrbitScanCandidatesResponse>({
    queryKey: ["orbit", "scan-candidates", scanCandidatesQueryString],
    queryFn: () =>
      fetchJson(
        `/api/orbit/scan-candidates?${scanCandidatesQueryString}`,
        undefined,
        orbitScanCandidatesResponseSchema
      ),
    placeholderData: keepPreviousData,
  });

  const { data: scanQuality } = useQuery<OrbitScanQualityPayload>({
    queryKey: ["orbit", "scan-quality"],
    queryFn: () =>
      fetchJson("/api/orbit/scan-quality", undefined, orbitScanQualityPayloadSchema),
    staleTime: 60_000,
  });

  const scanCandidateBookmarks = scanCandidatesData
    ? scanCandidatesData.bookmarks
    : bookmarks;

  const reviewBookmarks = useMemo(
    () =>
      mergeReviewBookmarks(
        mergeReviewBookmarks(bookmarks, scanCandidateBookmarks),
        scan.scannedBookmarks
      ),
    [bookmarks, scan.scannedBookmarks, scanCandidateBookmarks]
  );

  const batchState = useMemo(
    () =>
      deriveOrbitScanBatchState({
        scanCandidateBookmarks,
        bookmarkById,
        scanQuality,
        scanBatchMode,
        selectionMode,
        selectedBookmarkIds,
        queueSortDirection,
        queueIsLoading,
        hasSearchQuery,
        scanning: scan.scanning,
        hasPlan: Boolean(scan.plan),
      }),
    [
      scanCandidateBookmarks,
      bookmarkById,
      scanQuality,
      scanBatchMode,
      selectionMode,
      selectedBookmarkIds,
      queueSortDirection,
      queueIsLoading,
      hasSearchQuery,
      scan.scanning,
      scan.plan,
    ]
  );

  const {
    resolvedScanBatchMode,
    scanBatchProfile,
    scanBatchLimit,
    selectedScanPlan,
    scanningSelection,
    scanTargetIds,
    scanBatchMetadata,
    scanTargetCount,
    selectedScanTargetIds,
    deepUnlocked,
    deepLockedReason,
    hasSelectionOverflow,
    scanHelperText,
    scanButtonLabel,
  } = batchState;

  const planSuggestionIds = useMemo(
    () => scan.plan?.plan.suggestions.map((suggestion) => suggestion.bookmarkId) ?? [],
    [scan.plan]
  );

  const activePlanSuggestionIds = useMemo(
    () =>
      planSuggestionIds.filter(
        (id) => !appliedBookmarkIds.has(id) && !scan.dismissedBookmarkIds.has(id)
      ),
    [appliedBookmarkIds, planSuggestionIds, scan.dismissedBookmarkIds]
  );

  const passTotal = planSuggestionIds.length;

  const triagedCount = useMemo(
    () =>
      planSuggestionIds.filter(
        (id) => appliedBookmarkIds.has(id) || scan.dismissedBookmarkIds.has(id)
      ).length,
    [planSuggestionIds, appliedBookmarkIds, scan.dismissedBookmarkIds]
  );

  const currentScanContextKey = useMemo(
    () =>
      buildOrbitScanContextKey({
        orbitView,
        page,
        queryString,
        scanningSelection,
        scanTargetIds,
        batchMode: resolvedScanBatchMode,
        batchProfile: scanBatchProfile,
      }),
    [
      orbitView,
      page,
      queryString,
      scanningSelection,
      scanTargetIds,
      resolvedScanBatchMode,
      scanBatchProfile,
    ]
  );

  const canApplyStrongMatches = useMemo(() => {
    if (!scan.plan) return false;
    return scan.plan.plan.suggestions.some(
      (suggestion) =>
        !scan.dismissedBookmarkIds.has(suggestion.bookmarkId) &&
        isSafeAutoApplySuggestion(suggestion)
    );
  }, [scan.plan, scan.dismissedBookmarkIds]);

  const runners = useOrbitScanRunners({
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
    onOpenBookmarkReview: review.handleOpenBookmarkReview,
  });

  const {
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
  } = runners;

  const { clearConsumedReviewUrlParams } = useOrbitFlywheelScan({
    router,
    searchParams,
    highlightIdFromUrl,
    digestIdsFromUrl,
    sourceFromUrl,
    scanning: scan.scanning,
    buildScanRequest,
    runOrbitScan,
    setReviewSession: review.setReviewSession,
  });

  useEffect(() => {
    clearReviewUrlParamsRef.current = clearConsumedReviewUrlParams;
  }, [clearConsumedReviewUrlParams]);

  const handleClearScanPlan = useCallback(() => {
    scan.clearPlan();
    clearScanRunState();
  }, [clearScanRunState, scan]);

  return {
    scan,
    reviewBookmarks,
    appliedBookmarkIds,
    setAppliedBookmarkIds,
    scanBatchMode,
    setScanBatchMode,
    reviewSession: review.reviewSession,
    feedbackById: review.feedbackById,
    scanHelperText,
    scanButtonLabel,
    triagedCount,
    passTotal,
    activeScanPlanSuggestionCount: activePlanSuggestionIds.length,
    scanTargetIds,
    scanTargetCount,
    selectedScanTargetIds,
    resolvedScanBatchMode,
    scanBatchProfile,
    scanBatchLimit,
    deepUnlocked,
    deepLockedReason,
    canApplyStrongMatches,
    canRescanCurrentSelection,
    staleScanPlan,
    hasSelectionOverflow,
    lastScanRequest,
    handleScan,
    handleRetryScan,
    handleRescanCurrentSelection,
    handleApplyStrongMatches,
    handleOpenReviewAll: review.handleOpenReviewAll,
    handleClearScanPlan,
    handleOpenBookmarkReview: review.handleOpenBookmarkReview,
    handleReviewOpenChange: review.handleReviewOpenChange,
    handleApplyReviewedPlan: review.handleApplyReviewedPlan,
    handleKeepInOrbit: review.handleKeepInOrbit,
    handleAcceptSuggestion,
  };
}
