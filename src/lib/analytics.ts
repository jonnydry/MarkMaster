export interface MediaBreakdownCounts {
  totalBookmarks: number;
  mediaOnly: number;
  mediaAndLinks: number;
  linksOnly: number;
  textOnly: number;
}

export function buildMediaBreakdown(counts: MediaBreakdownCounts) {
  return [
    { type: "Media", count: counts.mediaOnly },
    { type: "Media + Links", count: counts.mediaAndLinks },
    { type: "Links", count: counts.linksOnly },
    { type: "Text Only", count: counts.textOnly },
  ];
}
