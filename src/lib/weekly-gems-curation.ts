import type { BookmarkWithRelations } from "@/types";

export type WeeklyGemsCuration = {
  primaryGems: BookmarkWithRelations[];
  resurfacedGems: BookmarkWithRelations[];
  otherStrong: BookmarkWithRelations[];
  allGems: BookmarkWithRelations[];
  displayGems: BookmarkWithRelations[];
};

export function buildWeeklyGemsCuration(
  rawGems: BookmarkWithRelations[],
  libraryGems: BookmarkWithRelations[],
  options?: { expanded?: boolean; excludeIds?: Set<string> }
): WeeklyGemsCuration {
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
