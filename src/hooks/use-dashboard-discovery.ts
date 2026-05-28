"use client";

import { useMemo } from "react";
import {
  usePerformanceHighlights,
  type PerformanceHighlightsResponse,
} from "@/hooks/use-performance-highlights";
import { getDislikedHighlightIds, getLikedHighlightIds } from "@/lib/highlight-feedback";
import {
  buildWeeklyGemsCuration,
  buildDiscoveryCarouselItems,
} from "@/lib/weekly-gems-curation";
export type DashboardDiscoveryParentData = {
  rawData?: PerformanceHighlightsResponse;
  libraryData?: PerformanceHighlightsResponse;
  rawLoading?: boolean;
  libraryLoading?: boolean;
  rawError?: boolean;
  refetchRaw?: () => void;
};

export function useDashboardDiscovery(options: {
  feedReady?: boolean;
  parentData?: DashboardDiscoveryParentData;
}) {
  const { feedReady = true, parentData } = options;

  const dislikedIds = getDislikedHighlightIds();
  const likedIds = getLikedHighlightIds();

  const useParent =
    parentData?.rawData !== undefined && parentData?.libraryData !== undefined;

  const {
    data: rawFetched,
    isLoading: rawLoading,
    isError: rawError,
    refetch: refetchRaw,
  } = usePerformanceHighlights(true, {
    dislikedIds,
    likedIds,
    enabled: !useParent,
  });

  const {
    data: libraryFetched,
    isLoading: libraryLoading,
    isError: libraryError,
  } = usePerformanceHighlights(false, {
    dislikedIds,
    likedIds,
    enabled: feedReady && !useParent,
  });

  const rawData = parentData?.rawData ?? rawFetched;
  const libraryData = parentData?.libraryData ?? libraryFetched;
  const parentLoading =
    parentData?.rawLoading === true || parentData?.libraryLoading === true;
  const internalLoading =
    !useParent && (rawLoading || (feedReady && libraryLoading));
  const isLoading = parentLoading || internalLoading;
  const hasError = parentData?.rawError ?? (rawError || libraryError);
  const refetch = parentData?.refetchRaw ?? refetchRaw;

  const quickPicks = useMemo(
    () => rawData?.bookmarks ?? [],
    [rawData?.bookmarks]
  );
  const quickPickIds = useMemo(
    () => new Set(quickPicks.map((b) => b.id)),
    [quickPicks]
  );
  const rawGems = quickPicks;
  const libraryGems = useMemo(
    () => libraryData?.bookmarks ?? [],
    [libraryData?.bookmarks]
  );

  const curation = useMemo(
    () => buildWeeklyGemsCuration(rawGems, libraryGems, { excludeIds: quickPickIds }),
    [rawGems, libraryGems, quickPickIds]
  );

  const digestDisplayGems = curation.displayGems;

  const hasDigestBatch = curation.allGems.length > 0;
  const hasDigestExtras = digestDisplayGems.length > 0;

  // Unified discovery carousel data (Phase 1 of Master Plan). Computed with useMemo.
  // Provides flat ordered list (raw front-loaded) + full ritualBatch preserving
  // exact batch construction, nurtured, cta.digest_review_together, digestIds + source=weekly-gems,
  // and onSaveAsCollection contract. Only DashboardDiscovery (default/flush) consumes the new fields.
  // HighlightsDigest / standalone WeeklyDigestPanel / perf SQL path untouched.
  const discovery = useMemo(
    () =>
      buildDiscoveryCarouselItems(rawGems, libraryGems, {
        excludeIdsForBatch: quickPickIds,
      }),
    [rawGems, libraryGems, quickPickIds]
  );

  return {
    quickPicks,
    quickPickIds,
    rawTotal: rawData?.total ?? quickPicks.length,
    libraryGems,
    curation,
    digestDisplayGems,
    hasDigestBatch,
    hasDigestExtras,
    // New unified carousel fields (additive only; old returns + buildWeeklyGemsCuration path
    // retained verbatim for safety / standalone surfaces per Master Plan). This increases
    // hook surface but was the minimal transition that avoided breaking any call sites or
    // future drift on the old curation contract. Only consumed by DashboardDiscovery.
    discoveryCarouselItems: discovery.carouselItems,
    ritualBatch: discovery.ritualBatch,
    ritualTotal: discovery.totalMixCount,
    resurfacedCount: discovery.resurfacedCount,
    discoveryEngagement: discovery.totalEngagement,
    itemLabels: discovery.itemLabels,
    hasMixContent: discovery.carouselItems.length > 0 || discovery.ritualBatch.length > 0,
    isLoading,
    hasError,
    refetch,
  };
}
