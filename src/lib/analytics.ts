import type { AnalyticsData } from "@/types";

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

export type VelocityDelta = { pct: number | null; abs: number };

export function computeTriagedPct(
  analytics: AnalyticsData | null | undefined
): number {
  if (!analytics || analytics.totalBookmarks === 0) return 0;
  const triaged = analytics.totalBookmarks - analytics.untaggedCount;
  return Math.max(0, Math.min(100, (triaged / analytics.totalBookmarks) * 100));
}

export function computeVelocityDelta(
  analytics: AnalyticsData | null | undefined
): VelocityDelta | null {
  if (!analytics) return null;
  const { last30dCount, previous30dCount } = analytics;
  if (previous30dCount === 0 && last30dCount === 0) {
    return { pct: 0, abs: 0 };
  }
  if (previous30dCount === 0) {
    return { pct: null, abs: last30dCount };
  }
  const pct = ((last30dCount - previous30dCount) / previous30dCount) * 100;
  return { pct, abs: last30dCount - previous30dCount };
}

export function computeAnnotationPct(
  analytics: AnalyticsData | null | undefined
): number {
  if (!analytics || analytics.totalBookmarks === 0) return 0;
  return (analytics.notedCount / analytics.totalBookmarks) * 100;
}
