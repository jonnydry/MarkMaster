"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import type { BookmarkWithRelations } from "@/types";

export type PerformanceHighlightsResponse = {
  bookmarks: BookmarkWithRelations[];
  total: number;
  totalPages?: number;
};

/**
 * Shared hook for fetching top-N highest-performing bookmarks by the
 * engagement-weighted performance score.
 *
 * @param raw - When true, only returns completely untouched bookmarks
 *              (no tags, no CollectionItems at all). Used for the
 *              dashboard "Highlights" strip (the "most deserving" items).
 *              When false (default), returns the absolute top performers
 *              across the entire library (used on the Collections overview).
 */
export function usePerformanceHighlights(raw = false) {
  const url = raw
    ? "/api/bookmarks?raw=true&sortField=performance&sortDirection=desc&limit=4&page=1"
    : "/api/bookmarks?sortField=performance&sortDirection=desc&limit=4&page=1";

  return useQuery<PerformanceHighlightsResponse>({
    queryKey: ["performance-highlights", raw ? "raw" : "all"],
    queryFn: () => fetchJson(url),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}
