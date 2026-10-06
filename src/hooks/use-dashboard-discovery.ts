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
  DISCOVERY_THIN_POOL_THRESHOLD,
} from "@/lib/weekly-gems-curation";

/**
 * Highlights share the database with the bookmark feed. Let the feed commit
 * and paint, then wait for idle time (or this timeout) before requesting them.
 */
const HIGHLIGHTS_AFTER_PAINT_TIMEOUT_MS = 200;

function useAfterFeedPaint(active: boolean) {
  const [epochActive, setEpochActive] = useState(active);
  const [ready, setReady] = useState(false);

  // Reset when the feed drops back out of the ready state. Doing this during
  // render keeps the idle wait from sticking across a later load.
  if (active !== epochActive) {
    setEpochActive(active);
    setReady(false);
  }

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: number | null = null;

    const markReady = () => {
      if (!cancelled) setReady(true);
    };

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(markReady, {
        timeout: HIGHLIGHTS_AFTER_PAINT_TIMEOUT_MS,
      });
    } else {
      timeoutId = window.setTimeout(markReady, HIGHLIGHTS_AFTER_PAINT_TIMEOUT_MS);
    }

    return () => {
      cancelled = true;
      if (idleId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [active]);

  return active && ready;
}

function unexcludedCount(ids: string[], bookmarks: { id: string }[] | undefined) {
  if (!bookmarks) return 0;
  if (ids.length === 0) return bookmarks.length;
  const excluded = new Set(ids);
  let count = 0;
  for (const bookmark of bookmarks) {
    if (!excluded.has(bookmark.id)) count += 1;
  }
  return count;
}

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
  // The feed's first paint happens before this effect's idle callback.
  const paintReady = useAfterFeedPaint(feedReady && !useParent);
  const rawEnabled = paintReady && !useParent;

  const {
    data: rawFetched,
    isError: rawError,
    refetch: refetchRaw,
  } = usePerformanceHighlights(true, {
    dislikedIds,
    likedIds,
    hardExcludeDisliked: true,
    excludeIds,
    limit: DISCOVERY_RAW_POOL_LIMIT,
    enabled: rawEnabled,
  });

  // Library filler only changes the strip when fewer than 3 raw candidates
  // remain. A healthy raw pool is one highlights request; the filler query
  // stays idle so it cannot compete with the feed.
  const needsLibraryFiller =
    rawEnabled &&
    rawFetched != null &&
    unexcludedCount(excludeIds, rawFetched.bookmarks) < DISCOVERY_THIN_POOL_THRESHOLD;

  const {
    data: libraryFetched,
    isError: libraryError,
    refetch: refetchLibrary,
  } = usePerformanceHighlights(false, {
    dislikedIds,
    likedIds,
    hardExcludeDisliked: true,
    enabled: needsLibraryFiller,
  });

  const rawData = parentData?.rawData ?? rawFetched;
  const libraryData = parentData?.libraryData ?? libraryFetched;
  const parentLoading =
    parentData?.rawLoading === true || parentData?.libraryLoading === true;
  const rawWaiting = rawEnabled && rawFetched == null && !rawError;
  const libraryWaiting = needsLibraryFiller && libraryFetched == null && !libraryError;
  const internalLoading =
    !useParent && feedReady && (!paintReady || rawWaiting || libraryWaiting);
  const isLoading = parentLoading || internalLoading;
  const hasError = parentData?.rawError ?? (rawError || libraryError);
  const refetchHighlights = useCallback(() => {
    void refetchRaw();
    if (needsLibraryFiller) void refetchLibrary();
  }, [needsLibraryFiller, refetchLibrary, refetchRaw]);
  const refetch = parentData?.refetchRaw ?? refetchHighlights;

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
      refetchHighlights();
    } else if (parentData?.refetchRaw) {
      parentData.refetchRaw();
    }
  }, [discovery.carouselItems, parentData, refetchHighlights, useParent]);

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
    /** Share one in-flight highlights fetch with a nested discovery strip. */
    discoveryParentData: {
      rawData,
      libraryData,
      rawLoading: internalLoading,
      libraryLoading: false,
      rawError: Boolean(rawError || libraryError),
      refetchRaw: refetchHighlights,
      excludeIds,
    } satisfies DashboardDiscoveryParentData,
  };
}
