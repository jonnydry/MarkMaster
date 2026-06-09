"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import type { CollectionWithCount, TagWithCount } from "@/types";

const LIBRARY_INDEX_STALE_TIME = 5 * 60 * 1000;
const LIBRARY_INDEX_GC_TIME = 30 * 60 * 1000;

const LIBRARY_STATS_QUERY_KEY = ["library-stats"] as const;

export type LibraryStats = {
  libraryBookmarkCount: number;
  organizedBookmarkCount: number;
};

export function useTagsQuery() {
  return useQuery<TagWithCount[]>({
    queryKey: ["tags"],
    queryFn: () => fetchJson("/api/tags"),
    staleTime: LIBRARY_INDEX_STALE_TIME,
    gcTime: LIBRARY_INDEX_GC_TIME,
  });
}

export function useCollectionsQuery() {
  return useQuery<CollectionWithCount[]>({
    queryKey: ["collections"],
    queryFn: () => fetchJson("/api/collections"),
    staleTime: LIBRARY_INDEX_STALE_TIME,
    gcTime: LIBRARY_INDEX_GC_TIME,
  });
}

export function useLibraryStatsQuery() {
  return useQuery<LibraryStats>({
    queryKey: LIBRARY_STATS_QUERY_KEY,
    queryFn: () => fetchJson("/api/collections/stats"),
    staleTime: LIBRARY_INDEX_STALE_TIME,
    gcTime: LIBRARY_INDEX_GC_TIME,
  });
}
