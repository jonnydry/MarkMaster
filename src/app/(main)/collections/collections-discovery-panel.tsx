"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DashboardDiscovery } from "@/components/dashboard-discovery";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { usePerformanceHighlights as usePerformanceHighlightsHook } from "@/hooks/use-performance-highlights";
import { getDislikedHighlightIds, getLikedHighlightIds } from "@/lib/highlight-feedback";
import { saveGemsAsCollection } from "@/lib/save-gems-as-collection";
import type { BookmarkWithRelations, TagWithCount } from "@/types";

export function CollectionsDiscoveryPanel({ tags }: { tags: TagWithCount[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { createCollectionQuick } = useCreateCollection();

  const strongPersonalTags = useMemo(
    () =>
      [...tags]
        .sort((a, b) => (b._count?.bookmarks ?? 0) - (a._count?.bookmarks ?? 0))
        .slice(0, 8)
        .map((tag) => tag.name),
    [tags]
  );

  const dislikedIds = getDislikedHighlightIds();
  const likedIds = getLikedHighlightIds();
  const {
    data: rawHighlightData,
    isLoading: rawHighlightsLoading,
    isError: rawHighlightsError,
    refetch: refetchRawHighlights,
  } = usePerformanceHighlightsHook(true, {
    dislikedIds,
    likedIds,
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
    usePersonalBoost: true,
  });

  const refetchDiscovery = useCallback(() => {
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
      }}
      onSelectBookmark={(id) =>
        router.push(`/dashboard?bookmark=${encodeURIComponent(id)}`)
      }
      onSaveAsCollection={handleSaveGemsAsCollection}
      explainer="High-performing posts from your library — quick picks to triage in Orbit, plus a weekly mix for batch review."
    />
  );
}
