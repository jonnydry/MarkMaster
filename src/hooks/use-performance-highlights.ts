"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { performanceHighlightsResponseSchema } from "@/lib/api-response-schemas";
import type { BookmarkWithRelations } from "@/types";

export type PerformanceHighlightsResponse = {
  bookmarks: BookmarkWithRelations[];
  total?: number;
  totalPages?: number;
  /** Populated when personalBoost=1: top authors (and tags) from user's organized bookmarks for richer personalization boost (Phase 2 item 7) */
  personalBoostAuthors?: string[];
  personalBoostTags?: string[];
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
 * @param options.usePersonalBoost - Enables Phase 2 lightweight personalization (item 7):
 *              server returns frequency signals from organized bookmarks; hook merges
 *              and applies modest 1.4x boost for strong author/tag overlap (in addition
 *              to liked/disliked feedback boosts).
 */
/** Default fetch size for raw untouched discovery pool. */
export const DISCOVERY_RAW_POOL_LIMIT = 24;

export function usePerformanceHighlights(
  raw = false,
  options?: {
    boostAuthors?: string[];
    boostTags?: string[];
    boostFactor?: number;
    /** Bookmark IDs the user has marked "not relevant" via inline feedback */
    dislikedIds?: string[];
    /** Bookmark IDs the user has marked "good" (positive boost) */
    likedIds?: string[];
    /** When true, removes disliked IDs from results instead of only deboosting them. */
    hardExcludeDisliked?: boolean;
    /** Server-side exclude list (e.g. recently shown in Discovery). */
    excludeIds?: string[];
    /** API result limit (default 4; discovery raw pool uses DISCOVERY_RAW_POOL_LIMIT). */
    limit?: number;
    /** When true, appends personalBoost=1 so the API includes frequency-based authors (and tags) from the user's organized bookmarks for richer Phase 2 personalization (item 7). */
    usePersonalBoost?: boolean;
    enabled?: boolean;
  }
) {
  const {
    boostAuthors = [],
    boostTags = [],
    boostFactor = 1.4,
    dislikedIds = [],
    likedIds = [],
    hardExcludeDisliked = false,
    excludeIds = [],
    limit = 4,
    usePersonalBoost = false,
    enabled = true,
  } = options || {};

  const dislikedSet = new Set(dislikedIds);
  const likedSet = new Set(likedIds);

  // B: listen for feedback changes (dispatched from lib setters) so parents re-render + fresh likedIds flow into hook for live 1.6x/curation
  const [feedbackVersion, setFeedbackVersion] = useState(0);
  useEffect(() => {
    const handler = () => setFeedbackVersion((v) => v + 1);
    window.addEventListener("markmaster:highlight-feedback-changed", handler);
    return () => window.removeEventListener("markmaster:highlight-feedback-changed", handler);
  }, []);

  const params = new URLSearchParams();
  if (raw) params.set("raw", "true");
  params.set("limit", String(limit));
  if (usePersonalBoost) params.set("personalBoost", "true");
  if (excludeIds.length > 0) params.set("excludeIds", excludeIds.join(","));
  const highlightUrl = `/api/bookmarks/highlights?${params.toString()}`;

  const cacheKey = [
    raw ? "raw" : "all",
    String(limit),
    excludeIds.join(","),
    boostAuthors.join(","),
    boostTags.join(","),
    dislikedIds.join(","),
    likedIds.join(","),
    String(hardExcludeDisliked),
    String(usePersonalBoost),
    String(feedbackVersion),
  ].join("|");

  return useQuery<PerformanceHighlightsResponse>({
    queryKey: ["performance-highlights", cacheKey],
    queryFn: async () => {
      const data = await fetchJson(
        highlightUrl,
        undefined,
        performanceHighlightsResponseSchema
      );

      let processed = data.bookmarks;

      if (hardExcludeDisliked && dislikedIds.length > 0) {
        processed = processed.filter((b) => !dislikedSet.has(b.id));
      }

      // Effective lists for Phase 2 richer personalization (item 7):
      // Merge any client-passed strong signals (e.g. frequent tags from _count) with server-provided
      // personalBoost* (top authors by organized bookmark frequency via lightweight overlap query).
      const serverAuthors: string[] = data.personalBoostAuthors ?? [];
      const serverTags: string[] = data.personalBoostTags ?? [];
      const effectiveBoostAuthors = [...new Set([...boostAuthors, ...serverAuthors])];
      const effectiveBoostTags = [...new Set([...boostTags, ...serverTags])];

      // Apply boosts from tags/authors (now supports frequency-weighted personal overlap on top of feedback)
      if (effectiveBoostAuthors.length || effectiveBoostTags.length) {
        processed = processed.map((b) => {
          let boost = 1;
          if (effectiveBoostAuthors.includes(b.authorUsername)) boost *= boostFactor;
          if (b.tags.some((t) => effectiveBoostTags.includes(t.tag.name))) {
            boost *= boostFactor;
          }
          return { ...b, _boost: boost };
        });
      }

      // Strongly deprioritize items the user has given negative feedback on
      if (!hardExcludeDisliked && dislikedIds.length > 0) {
        processed = processed.map((b) => {
          if (dislikedSet.has(b.id)) {
            return { ...b, _boost: (((b as { _boost?: number })._boost || 1) * 0.15) };
          }
          return b;
        });
      }

      // Positive boost for items marked "Good" (symmetric to deboost, >1.0)
      if (likedIds.length > 0) {
        processed = processed.map((b) => {
          if (likedSet.has(b.id)) {
            return { ...b, _boost: (((b as { _boost?: number })._boost || 1) * 1.6) };
          }
          return b;
        });
      }

      // Final sort by boosted score.
      // Copy before sorting: when no boosts apply, `processed` is still the same
      // array reference React Query holds in cache, and sorting in place would
      // corrupt the cached result on subsequent reads/refetches.
      const sorted = [...processed].sort(
        (a, b) =>
          ((b as { _boost?: number })._boost || 1) -
          ((a as { _boost?: number })._boost || 1)
      );

      return {
        ...data,
        bookmarks: sorted,
      };
    },
    staleTime: 1000 * 60 * 2,
    enabled,
  });
}
