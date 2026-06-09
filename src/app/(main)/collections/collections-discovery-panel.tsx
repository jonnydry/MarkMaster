"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DashboardDiscovery } from "@/components/dashboard-discovery";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useHighlightFeedbackIds } from "@/hooks/use-highlight-feedback-ids";
import {
  usePerformanceHighlights as usePerformanceHighlightsHook,
  DISCOVERY_RAW_POOL_LIMIT,
} from "@/hooks/use-performance-highlights";
import { getDiscoveryShownIds } from "@/lib/discovery-shown";
import { saveGemsAsCollection } from "@/lib/save-gems-as-collection";
import type { BookmarkWithRelations, TagWithCount } from "@/types";

export function CollectionsDiscoveryPanel({ tags }: { tags: TagWithCount[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { createCollectionQuick } = useCreateCollection();
  const [refreshVersion, setRefreshVersion] = useState(0);

  const strongPersonalTags = useMemo(
    () =>
      [...tags]
        .sort((a, b) => (b._count?.bookmarks ?? 0) - (a._count?.bookmarks ?? 0))
        .slice(0, 8)
        .map((tag) => tag.name),
    [tags]
  );

  const { dislikedIds, likedIds, feedbackVersion } = useHighlightFeedbackIds();
  const excludeIds = useMemo(
    () => [...new Set([...getDiscoveryShownIds(), ...dislikedIds])],
    [dislikedIds, refreshVersion, feedbackVersion]
  );

  const {
    data: rawHighlightData,
    isLoading: rawHighlightsLoading,
    isError: rawHighlightsError,
    refetch: refetchRawHighlights,
  } = usePerformanceHighlightsHook(true, {
    dislikedIds,
    likedIds,
    hardExcludeDisliked: true,
    excludeIds,
    limit: DISCOVERY_RAW_POOL_LIMIT,
  });
  const {
    data: libraryHighlightData,
    isLoading: libraryHighlightsLoading,
    isError: libraryHighlightsError,
    refetch: refetchLibraryHighlights,
  } = usePerformanceHighlightsHook(false, {
    boostTags: strongPersonalTags,
    dislikedIds,
    likedIds,
    hardExcludeDisliked: true,
    usePersonalBoost: true,
  });

  const refetchDiscovery = useCallback(() => {
    setRefreshVersion((v) => v + 1);
    void refetchRawHighlights();
    void refetchLibraryHighlights();
  }, [refetchRawHighlights, refetchLibraryHighlights]);

  const handleSaveGemsAsCollection = useCallback(
    async (gems: BookmarkWithRelations[], suggestedName: string) => {
      try {
        await saveGemsAsCollection(
          queryClient,
          createCollectionQuick,
          gems,
          suggestedName
        );
        toast.success(`Created "${suggestedName}" with ${gems.length} gems`);
      } catch {
        toast.error("Could not save the gems as a collection");
      }
    },
    [createCollectionQuick, queryClient]
  );

  return (
    <DashboardDiscovery
      feedReady
      variant="flush"
      parentData={{
        rawData: rawHighlightData,
        libraryData: libraryHighlightData,
        rawLoading: rawHighlightsLoading || libraryHighlightsLoading,
        libraryLoading: libraryHighlightsLoading,
        rawError: rawHighlightsError || libraryHighlightsError,
        refetchRaw: refetchDiscovery,
        excludeIds,
        refreshVersion,
      }}
      onSelectBookmark={(id) =>
        router.push(`/dashboard?bookmark=${encodeURIComponent(id)}`)
      }
      onSaveAsCollection={handleSaveGemsAsCollection}
      explainer="High-engagement saves waiting for tags or collections — rotate the mix to triage more in Orbit."
    />
  );
}
