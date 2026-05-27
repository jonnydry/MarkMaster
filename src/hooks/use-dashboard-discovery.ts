"use client";

import { useMemo } from "react";
import {
  usePerformanceHighlights,
  type PerformanceHighlightsResponse,
} from "@/hooks/use-performance-highlights";
import { getDislikedHighlightIds, getLikedHighlightIds } from "@/lib/highlight-feedback";
import {
  buildWeeklyGemsCuration,
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

  return {
    quickPicks,
    quickPickIds,
    rawTotal: rawData?.total ?? quickPicks.length,
    libraryGems,
    curation,
    digestDisplayGems,
    hasDigestBatch,
    hasDigestExtras,
    isLoading,
    hasError,
    refetch,
  };
}
