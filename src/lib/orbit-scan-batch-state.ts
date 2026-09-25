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
  hybridScanAvailable?: boolean;
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
  sweepUnlocked: boolean;
  sweepLockedReason: string;
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
    hybridScanAvailable = false,
  } = input;

  const candidatePoolPlan = planOrbitScanBatch(
    scanCandidateBookmarks,
    Math.min(
      ORBIT_SCAN_BATCH_PROFILES.sweep.size,
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
    : (scanQuality?.deep.reason ?? "Finish a few successful scans before Deep unlocks.");
  const sweepUnlocked = hybridScanAvailable;
  const sweepLockedReason = hybridScanAvailable
    ? "Sweep reviews 72 bookmarks in one pass, reusing existing tags only."
    : "Sweep needs library matching configured.";

  const resolvedScanBatchMode: OrbitScanBatchMode =
    scanBatchMode === "deep" && !deepUnlocked
      ? "auto"
      : scanBatchMode === "sweep" && !sweepUnlocked
        ? "auto"
        : scanBatchMode;

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
        ? `Scan matches your vocabulary on the first ${scanTargetCount} selected, then escalates leftovers. Review before you apply.`
        : `Scan matches your vocabulary on ${scanTargetCount} selected bookmark${scanTargetCount === 1 ? "" : "s"}, then escalates leftovers. Review before you apply.`
      : queueBatchCount > 0
        ? `${scanProfileLabel} · ${queueBatchCount} ${queueOrderLabel} of ${defaultScanPlan.candidateCount.toLocaleString()} — match your tags, then escalate leftovers. Review before applying.`
        : hasSearchQuery
          ? "No bookmarks match the current Orbit filter."
          : "Queue clear — new saves land here for hybrid tagging.";

  const scanButtonLabel = queueIsLoading
    ? "Loading queue…"
    : scanTargetCount === 0 && !scanning
      ? hasSearchQuery
        ? "No matches"
        : "Queue clear"
      : hasPlan
        ? scanning
          ? "Refreshing…"
          : scanningSelection
            ? "Refresh selection"
            : "Refresh scan"
        : scanning
          ? scanningSelection
            ? "Matching selection…"
            : "Matching queue…"
          : scanningSelection
            ? "Scan selection"
            : "Scan queue";

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
    sweepUnlocked,
    sweepLockedReason,
    hasSelectionOverflow,
    scanHelperText,
    scanButtonLabel,
  };
}
