"use client";

import { useMemo } from "react";
import {
  usePerformanceHighlights,
  type PerformanceHighlightsResponse,
} from "@/hooks/use-performance-highlights";
import { getDislikedHighlightIds, getLikedHighlightIds } from "@/lib/highlight-feedback";
import { WeeklyDigestPanel } from "@/components/weekly-digest-panel";
import { cn } from "@/lib/utils";
import type { BookmarkWithRelations } from "@/types";

/**
 * Standalone "This Week's Gems" section (e.g. Collections page).
 * Dashboard uses unified {@link DashboardDiscovery} instead.
 */
interface HighlightsDigestProps {
  className?: string;
  onSaveAsCollection?: (bookmarks: BookmarkWithRelations[], suggestedName: string) => void;
  rawData?: PerformanceHighlightsResponse;
  libraryData?: PerformanceHighlightsResponse;
  isLoading?: boolean;
}

export function HighlightsDigest({
  className,
  onSaveAsCollection,
  rawData: rawDataProp,
  libraryData: libraryDataProp,
  isLoading: isLoadingProp,
}: HighlightsDigestProps) {
  const dislikedIds = getDislikedHighlightIds();
  const likedIds = getLikedHighlightIds();
  const useParentData = rawDataProp !== undefined && libraryDataProp !== undefined;

  const { data: rawFetched, isLoading: rawLoading } = usePerformanceHighlights(true, {
    dislikedIds,
    likedIds,
    enabled: !useParentData,
  });
  const { data: libraryFetched, isLoading: libraryLoading } = usePerformanceHighlights(false, {
    dislikedIds,
    likedIds,
    enabled: !useParentData,
  });

  const rawData = rawDataProp ?? rawFetched;
  const libraryData = libraryDataProp ?? libraryFetched;
  const digestLoading = isLoadingProp ?? (!useParentData && (rawLoading || libraryLoading));

  const rawGems = useMemo(() => rawData?.bookmarks ?? [], [rawData?.bookmarks]);
  const libraryGems = useMemo(() => libraryData?.bookmarks ?? [], [libraryData?.bookmarks]);
  const rawTotal = rawData?.total ?? rawGems.length;

  if (digestLoading) {
    return (
      <section
        className={cn("mx-auto w-full max-w-[960px] space-y-3 px-4 pb-8 sm:px-5", className)}
        aria-busy
        aria-label="Loading Weekly Gems"
      >
        <div className="h-9 w-48 rounded skeleton-shimmer" />
        <div className="h-32 rounded-xl border border-hairline-soft skeleton-shimmer" />
      </section>
    );
  }

  return (
    <WeeklyDigestPanel
      rawGems={rawGems}
      libraryGems={libraryGems}
      rawTotal={rawTotal}
      onSaveAsCollection={onSaveAsCollection}
      className={className}
    />
  );
}
