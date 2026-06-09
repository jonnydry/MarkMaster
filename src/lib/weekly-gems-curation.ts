import { shuffleWithSeed } from "@/lib/discovery-shown";
import type { BookmarkWithRelations } from "@/types";

export type WeeklyGemsCuration = {
  primaryGems: BookmarkWithRelations[];
  resurfacedGems: BookmarkWithRelations[];
  otherStrong: BookmarkWithRelations[];
  allGems: BookmarkWithRelations[];
  displayGems: BookmarkWithRelations[];
};

type CuratedMix = {
  primary: BookmarkWithRelations[];
  resurfacedGems: BookmarkWithRelations[];
  otherStrong: BookmarkWithRelations[];
};

/** Minimum filtered raw candidates before library filler is added. */
export const DISCOVERY_THIN_POOL_THRESHOLD = 3;

/** Minimum raw pool depth to fill carousel with raw-only items. */
export const DISCOVERY_RAW_HEALTHY_THRESHOLD = 4;

/**
 * Shared core computation for both legacy digest curation and the new unified
 * discovery carousel (Phase 1 cleanup pass).
 */
function computeCuratedMix(
  rawGems: BookmarkWithRelations[],
  libraryGems: BookmarkWithRelations[]
): CuratedMix {
  const now = Date.now();
  const primary = rawGems.slice(0, 3);
  const libraryOnly = libraryGems.filter((g) => !rawGems.some((r) => r.id === g.id));
  const resurfacedGems = libraryOnly
    .filter((g) => {
      const ageDays = (now - new Date(g.bookmarkedAt).getTime()) / (1000 * 3600 * 24);
      return ageDays > 30;
    })
    .slice(0, 2);
  const otherStrong = libraryOnly
    .filter((g) => !resurfacedGems.some((r) => r.id === g.id))
    .slice(0, 3);

  return { primary, resurfacedGems, otherStrong };
}

function filterExcluded(
  gems: BookmarkWithRelations[],
  exclude?: Set<string>
): BookmarkWithRelations[] {
  if (!exclude?.size) return gems;
  return gems.filter((g) => !exclude.has(g.id));
}

export function buildWeeklyGemsCuration(
  rawGems: BookmarkWithRelations[],
  libraryGems: BookmarkWithRelations[],
  options?: { expanded?: boolean; excludeIds?: Set<string> }
): WeeklyGemsCuration {
  const { primary, resurfacedGems, otherStrong } = computeCuratedMix(rawGems, libraryGems);

  const allGems = [...primary, ...resurfacedGems, ...otherStrong];
  const exclude = options?.excludeIds;
  const digestGems = exclude
    ? allGems.filter((g) => !exclude.has(g.id))
    : allGems;
  const displayGems = options?.expanded ? digestGems : digestGems.slice(0, 6);

  return {
    primaryGems: primary,
    resurfacedGems,
    otherStrong,
    allGems: digestGems,
    displayGems,
  };
}

export function buildDigestItemLabels(
  resurfacedGems: BookmarkWithRelations[]
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const g of resurfacedGems) {
    labels[g.id] = "Resurfaced";
  }
  return labels;
}

export function computeDigestEngagement(bookmarks: BookmarkWithRelations[]): number {
  return bookmarks.reduce((sum, b) => {
    const m = b.publicMetrics;
    if (!m) return sum;
    return sum + (m.like_count || 0) + (m.reply_count || 0) + (m.bookmark_count || 0);
  }, 0);
}

export function filterDigestDisplayGems(
  displayGems: BookmarkWithRelations[],
  quickPickIds: Set<string>
): BookmarkWithRelations[] {
  return displayGems.filter((g) => !quickPickIds.has(g.id));
}

/**
 * Discovery carousel data builder (Unified High-Engagement Discovery Carousel).
 * Returns a flat, ordered list of items (raw high-performers front-loaded, then resurfaced + strong library)
 * plus the full ritualBatch (with exact overlap logic for batch CTA "N" count, digestIds, and source=weekly-gems).
 * Visual distinction via context + existing itemLabels (for "Resurfaced" badges).
 *
 * This centralizes curation for the single carousel in DashboardDiscovery (default + flush).
 * Ritual contracts, telemetry, nurtured, onSaveAsCollection preserved exactly.
 *
 * See: docs/design/Unified-High-Engagement-Discovery-Carousel-Plan.md
 */
export type DiscoveryCarouselItem = {
  bookmark: BookmarkWithRelations;
  context: "raw" | "resurfaced" | "strong";
};

export function buildDiscoveryCarouselItems(
  rawGems: BookmarkWithRelations[],
  libraryGems: BookmarkWithRelations[],
  options?: {
    excludeIdsForBatch?: Set<string>;
    /** Shown + disliked IDs to omit from carousel selection. */
    excludeIds?: Set<string>;
    maxCarouselBookmarks?: number;
    rotationSeed?: string;
    thinPoolThreshold?: number;
    rawHealthyThreshold?: number;
  }
): {
  carouselItems: DiscoveryCarouselItem[];
  ritualBatch: BookmarkWithRelations[];
  itemLabels: Record<string, string>;
  totalMixCount: number;
  resurfacedCount: number;
  totalEngagement: number;
  rawCarouselCount: number;
} {
  const maxBm = options?.maxCarouselBookmarks ?? 6;
  const thinThreshold = options?.thinPoolThreshold ?? DISCOVERY_THIN_POOL_THRESHOLD;
  const healthyThreshold = options?.rawHealthyThreshold ?? DISCOVERY_RAW_HEALTHY_THRESHOLD;

  const exclude = new Set<string>([
    ...(options?.excludeIds ? [...options.excludeIds] : []),
    ...(options?.excludeIdsForBatch ? [...options.excludeIdsForBatch] : []),
  ]);

  let rawCandidates = filterExcluded(rawGems, exclude);
  if (options?.rotationSeed) {
    rawCandidates = shuffleWithSeed(rawCandidates, options.rotationSeed);
  }

  const { resurfacedGems, otherStrong } = computeCuratedMix(rawGems, libraryGems);
  const libraryFiller = filterExcluded(
    [...resurfacedGems, ...otherStrong],
    exclude
  );

  const carouselItems: DiscoveryCarouselItem[] = [];
  const seen = new Set<string>();

  const addItem = (bookmark: BookmarkWithRelations, context: DiscoveryCarouselItem["context"]) => {
    if (seen.has(bookmark.id) || carouselItems.length >= maxBm) return;
    seen.add(bookmark.id);
    carouselItems.push({ bookmark, context });
  };

  const useRawOnly =
    rawCandidates.length >= healthyThreshold;

  if (useRawOnly) {
    for (const b of rawCandidates) {
      addItem(b, "raw");
    }
  } else {
    for (const b of rawCandidates) {
      addItem(b, "raw");
    }
    if (rawCandidates.length < thinThreshold) {
      for (const b of libraryFiller) {
        const context: DiscoveryCarouselItem["context"] = resurfacedGems.some(
          (g) => g.id === b.id
        )
          ? "resurfaced"
          : "strong";
        addItem(b, context);
      }
    }
  }

  const ritualBatch = carouselItems.map((item) => item.bookmark);
  const visibleResurfaced = carouselItems.filter((i) => i.context === "resurfaced");
  const itemLabels = buildDigestItemLabels(
    visibleResurfaced.map((i) => i.bookmark)
  );
  const totalEngagement = computeDigestEngagement(ritualBatch);
  const rawCarouselCount = carouselItems.filter((i) => i.context === "raw").length;

  return {
    carouselItems,
    ritualBatch,
    itemLabels,
    totalMixCount: ritualBatch.length,
    resurfacedCount: visibleResurfaced.length,
    totalEngagement,
    rawCarouselCount,
  };
}
