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
 * Standalone HighlightsDigest + non-embedded WeeklyDigestPanel untouched.
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
  options?: { excludeIdsForBatch?: Set<string>; maxCarouselBookmarks?: number }
): {
  carouselItems: DiscoveryCarouselItem[];
  ritualBatch: BookmarkWithRelations[];
  itemLabels: Record<string, string>;
  totalMixCount: number;
  resurfacedCount: number;
  totalEngagement: number;
} {
  const maxBm = options?.maxCarouselBookmarks ?? 6;

  // Front-load raw untouched high-performers (capped at 3 to exactly match primaryForOverlap
  // slice used in ritualBatch below; ensures every visible carousel item participates in the
  // "full mix" batch CTA + digestIds payload. Prevents misalignment bug.)
  const rawFrontCount = Math.min(3, maxBm);
  const rawFront = rawGems.slice(0, rawFrontCount);

  // Use shared curation core (eliminates duplication with buildWeeklyGemsCuration)
  const { primary: primaryForOverlap, resurfacedGems, otherStrong } =
    computeCuratedMix(rawGems, libraryGems);

  // Build ordered flat carousel list (raw first, then resurf, then strong; deduped)
  const seen = new Set<string>();
  const carouselItems: DiscoveryCarouselItem[] = [];
  for (const b of rawFront) {
    if (!seen.has(b.id) && carouselItems.length < maxBm) {
      seen.add(b.id);
      carouselItems.push({ bookmark: b, context: "raw" });
    }
  }
  for (const b of resurfacedGems) {
    if (!seen.has(b.id) && carouselItems.length < maxBm) {
      seen.add(b.id);
      carouselItems.push({ bookmark: b, context: "resurfaced" });
    }
  }
  for (const b of otherStrong) {
    if (!seen.has(b.id) && carouselItems.length < maxBm) {
      seen.add(b.id);
      carouselItems.push({ bookmark: b, context: "strong" });
    }
  }

  // Ritual batch: EXACT overlap logic from WeeklyDigestPanel for correct N, digestIds payload,
  // cta.digest_review_together gems count, and /orbit?source=weekly-gems contract.
  // Includes quick-pick overlap + curated extras.
  const allCuration = [...primaryForOverlap, ...resurfacedGems, ...otherStrong];
  const exclude = options?.excludeIdsForBatch;
  const curatedPortion = exclude
    ? allCuration.filter((g) => !exclude.has(g.id))
    : allCuration;
  const fromQuickPicks = exclude
    ? primaryForOverlap.filter((g) => exclude.has(g.id))
    : [];
  let ritualBatch = [...fromQuickPicks, ...curatedPortion];
  const seenBatch = new Set<string>();
  ritualBatch = ritualBatch.filter((b) => {
    if (seenBatch.has(b.id)) return false;
    seenBatch.add(b.id);
    return true;
  });

  const itemLabels = buildDigestItemLabels(resurfacedGems);
  const totalEngagement = computeDigestEngagement(ritualBatch);

  return {
    carouselItems,
    ritualBatch,
    itemLabels,
    totalMixCount: ritualBatch.length,
    resurfacedCount: resurfacedGems.length,
    totalEngagement,
  };
}
