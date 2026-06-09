"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  usePerformanceHighlights,
  DISCOVERY_RAW_POOL_LIMIT,
  type PerformanceHighlightsResponse,
} from "@/hooks/use-performance-highlights";
import { useHighlightFeedbackIds } from "@/hooks/use-highlight-feedback-ids";
import { getDislikedHighlightIds } from "@/lib/highlight-feedback";
import {
  getDiscoveryShownIds,
  addDiscoveryShownIds,
  getDailyRotationSeed,
} from "@/lib/discovery-shown";
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
  /** When set, discovery uses parent fetches (collections panel) with these exclude/rotation inputs. */
  excludeIds?: string[];
  refreshVersion?: number;
};

export function useDashboardDiscovery(options: {
  feedReady?: boolean;
  parentData?: DashboardDiscoveryParentData;
}) {
  const { feedReady = true, parentData } = options;

  const { dislikedIds, likedIds, feedbackVersion } = useHighlightFeedbackIds();
  const [shownVersion, setShownVersion] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const onShown = () => setShownVersion((v) => v + 1);
    window.addEventListener("markmaster:discovery-shown-changed", onShown);
    return () => {
      window.removeEventListener("markmaster:discovery-shown-changed", onShown);
    };
  }, []);
  const excludeIds = useMemo(
    () => [
      ...new Set([
        ...getDiscoveryShownIds(),
        ...getDislikedHighlightIds(),
        ...(parentData?.excludeIds ?? []),
      ]),
    ],
    // feedbackVersion / shownVersion / refreshVersion bust cache after localStorage updates
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version counters intentionally drive re-reads
    [parentData?.excludeIds, feedbackVersion, shownVersion, refreshVersion]
  );

  const useParent = parentData !== undefined;
  const effectiveRefreshVersion = parentData?.refreshVersion ?? refreshVersion;

  const {
    data: rawFetched,
    isLoading: rawLoading,
    isError: rawError,
    refetch: refetchRaw,
  } = usePerformanceHighlights(true, {
    dislikedIds,
    likedIds,
    hardExcludeDisliked: true,
    excludeIds,
    limit: DISCOVERY_RAW_POOL_LIMIT,
    enabled: !useParent,
  });

  const {
    data: libraryFetched,
    isLoading: libraryLoading,
    isError: libraryError,
    refetch: refetchLibrary,
  } = usePerformanceHighlights(false, {
    dislikedIds,
    likedIds,
    hardExcludeDisliked: true,
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

  const rotationSeed = `${getDailyRotationSeed()}-${effectiveRefreshVersion}`;

  const discovery = useMemo(
    () =>
      buildDiscoveryCarouselItems(rawGems, libraryGems, {
        excludeIds: new Set(excludeIds),
        rotationSeed,
      }),
    [rawGems, libraryGems, excludeIds, rotationSeed]
  );

  const refreshMix = useCallback(() => {
    const rawIds = discovery.carouselItems
      .filter((item) => item.context === "raw")
      .map((item) => item.bookmark.id);
    if (rawIds.length > 0) {
      addDiscoveryShownIds(rawIds);
    }
    setRefreshVersion((v) => v + 1);
    if (!useParent) {
      void refetchRaw();
      if (feedReady) void refetchLibrary();
    } else if (parentData?.refetchRaw) {
      parentData.refetchRaw();
    }
  }, [
    discovery.carouselItems,
    feedReady,
    parentData,
    refetchLibrary,
    refetchRaw,
    useParent,
  ]);

  return {
    quickPicks,
    quickPickIds,
    rawTotal: rawData?.total ?? quickPicks.length,
    libraryGems,
    curation,
    digestDisplayGems,
    hasDigestBatch,
    hasDigestExtras,
    discoveryCarouselItems: discovery.carouselItems,
    ritualBatch: discovery.ritualBatch,
    ritualTotal: discovery.totalMixCount,
    resurfacedCount: discovery.resurfacedCount,
    rawCarouselCount: discovery.rawCarouselCount,
    discoveryEngagement: discovery.totalEngagement,
    itemLabels: discovery.itemLabels,
    hasMixContent: discovery.carouselItems.length > 0 || discovery.ritualBatch.length > 0,
    isLoading,
    hasError,
    refetch,
    refreshMix,
  };
}
