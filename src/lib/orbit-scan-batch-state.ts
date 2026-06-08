import { planOrbitScanBatch } from "@/lib/orbit-batch-planner";
import {
  batchMetadataFromPlan,
  chooseAutoProfile,
} from "@/lib/orbit-scan-batch-utils";
import {
  ORBIT_SCAN_BATCH_PROFILES,
  type OrbitScanBatchMode,
  type OrbitScanBatchProfileId,
} from "@/lib/orbit-config";
import type { OrbitSortDirection } from "@/lib/orbit-navigation";
import type {
  BookmarkWithRelations,
  OrbitScanBatchMetadata,
  OrbitScanQualityPayload,
} from "@/types";

export function mergeReviewBookmarks(
  bookmarks: BookmarkWithRelations[],
  scanCandidateBookmarks: BookmarkWithRelations[]
): BookmarkWithRelations[] {
  const byId = new Map(
    scanCandidateBookmarks.map((bookmark) => [bookmark.id, bookmark])
  );
  for (const bookmark of bookmarks) {
    byId.set(bookmark.id, bookmark);
  }
  return Array.from(byId.values());
}

export type OrbitScanBatchStateInput = {
  scanCandidateBookmarks: BookmarkWithRelations[];
  bookmarkById: Map<string, BookmarkWithRelations>;
  scanQuality: OrbitScanQualityPayload | undefined;
  scanBatchMode: OrbitScanBatchMode;
  selectionMode: boolean;
  selectedBookmarkIds: Set<string>;
  queueSortDirection: OrbitSortDirection;
  queueIsLoading: boolean;
  hasSearchQuery: boolean;
  scanning: boolean;
  hasPlan: boolean;
};

export type OrbitScanBatchState = {
  resolvedScanBatchMode: OrbitScanBatchMode;
  scanBatchProfile: OrbitScanBatchProfileId;
  scanBatchLimit: number;
  defaultScanPlan: ReturnType<typeof planOrbitScanBatch>;
  selectedScanPlan: ReturnType<typeof planOrbitScanBatch>;
  scanningSelection: boolean;
  scanTargetIds: string[];
  scanBatchMetadata: OrbitScanBatchMetadata;
  scanTargetCount: number;
  queueBatchCount: number;
  selectedScanTargetIds: string[];
  deepUnlocked: boolean;
  deepLockedReason: string;
  hasSelectionOverflow: boolean;
  scanHelperText: string;
  scanButtonLabel: string;
};

export function deriveOrbitScanBatchState(
  input: OrbitScanBatchStateInput
): OrbitScanBatchState {
  const {
    scanCandidateBookmarks,
    bookmarkById,
    scanQuality,
    scanBatchMode,
    selectionMode,
    selectedBookmarkIds,
    queueSortDirection,
    queueIsLoading,
    hasSearchQuery,
    scanning,
    hasPlan,
  } = input;

  const candidatePoolPlan = planOrbitScanBatch(
    scanCandidateBookmarks,
    Math.min(
      ORBIT_SCAN_BATCH_PROFILES.deep.size,
      Math.max(1, scanCandidateBookmarks.length)
    )
  );

  const autoScanBatchProfile = chooseAutoProfile({
    quality: scanQuality,
    sourceUnknownRate: candidatePoolPlan.sourceUnknownRate,
  });

  const deepLockedBySourceQuality = candidatePoolPlan.sourceUnknownRate > 0.35;
  const deepUnlocked =
    Boolean(scanQuality?.deep.unlocked) && !deepLockedBySourceQuality;
  const deepLockedReason = deepLockedBySourceQuality
    ? "Current candidates have too much missing source context for Deep."
    : (scanQuality?.deep.reason ?? "Needs scan history before Deep unlocks.");

  const resolvedScanBatchMode: OrbitScanBatchMode =
    scanBatchMode === "deep" && !deepUnlocked ? "auto" : scanBatchMode;

  const scanBatchProfile: OrbitScanBatchProfileId =
    resolvedScanBatchMode === "auto"
      ? autoScanBatchProfile
      : resolvedScanBatchMode;

  const scanBatchLimit = ORBIT_SCAN_BATCH_PROFILES[scanBatchProfile].size;

  const defaultScanPlan = planOrbitScanBatch(scanCandidateBookmarks, scanBatchLimit);

  const selectedBookmarks = Array.from(selectedBookmarkIds).flatMap((bookmarkId) => {
    const bookmark = bookmarkById.get(bookmarkId);
    return bookmark ? [bookmark] : [];
  });

  const selectedScanPlan = planOrbitScanBatch(selectedBookmarks, scanBatchLimit);
  const selectedScanTargetIds = selectedScanPlan.bookmarkIds;

  const scanningSelection = selectionMode && selectedScanTargetIds.length > 0;

  const scanTargetIds = scanningSelection
    ? selectedScanTargetIds
    : defaultScanPlan.bookmarkIds;

  const scanBatchMetadata = scanningSelection
    ? batchMetadataFromPlan({
        plan: selectedScanPlan,
        mode: resolvedScanBatchMode,
        profile: scanBatchProfile,
      })
    : batchMetadataFromPlan({
        plan: defaultScanPlan,
        mode: resolvedScanBatchMode,
        profile: scanBatchProfile,
      });

  const scanTargetCount = scanTargetIds.length;
  const queueBatchCount = defaultScanPlan.bookmarkIds.length;
  const hasSelectionOverflow = selectedBookmarkIds.size > scanBatchLimit;
  const scanProfileLabel = ORBIT_SCAN_BATCH_PROFILES[scanBatchProfile].label;
  const queueOrderLabel = queueSortDirection === "asc" ? "oldest" : "newest";

  const scanHelperText = queueIsLoading
    ? "Loading the current Orbit queue."
    : scanningSelection
      ? hasSelectionOverflow
        ? `Grok will suggest tags and destinations for the first ${scanTargetCount} selected bookmarks. Review before you apply.`
        : `Grok will suggest tags and destinations for ${scanTargetCount} selected bookmark${scanTargetCount === 1 ? "" : "s"}. Review before you apply.`
      : queueBatchCount > 0
        ? `${scanProfileLabel} scan selected ${queueBatchCount} ${queueOrderLabel} un-triaged bookmark${queueBatchCount === 1 ? "" : "s"} from ${defaultScanPlan.candidateCount.toLocaleString()} candidates. Review each suggestion before applying.`
        : hasSearchQuery
          ? "No bookmarks match the current Orbit filter."
          : "Orbit is clear.";

  const scanButtonLabel = queueIsLoading
    ? "Loading queue…"
    : scanTargetCount === 0 && !scanning
      ? hasSearchQuery
        ? "No matches"
        : "Orbit is clear"
      : hasPlan
        ? scanning
          ? "Refreshing…"
          : scanningSelection
            ? "Refresh selection"
            : "Refresh queue"
        : scanning
          ? scanningSelection
            ? "Categorizing selection…"
            : "Categorizing queue…"
          : scanningSelection
            ? "Auto-categorize selection"
            : "Auto-categorize queue";

  return {
    resolvedScanBatchMode,
    scanBatchProfile,
    scanBatchLimit,
    defaultScanPlan,
    selectedScanPlan,
    scanningSelection,
    scanTargetIds,
    scanBatchMetadata,
    scanTargetCount,
    queueBatchCount,
    selectedScanTargetIds,
    deepUnlocked,
    deepLockedReason,
    hasSelectionOverflow,
    scanHelperText,
    scanButtonLabel,
  };
}
