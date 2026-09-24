import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatRow } from "@/components/ui/stat-row";

type CollectionsOverviewProps = {
  libraryBookmarkCount?: number;
  organizedBookmarkCount: number;
  isLibraryStatsLoading?: boolean;
  publicCollections: number;
  emptyCollections: number;
  onOrganizeUnshelved: () => void;
};

/**
 * Quiet stat line (Analytics `dl` pattern) — replaces the old hero + metric
 * tiles. Counts per collection type live on the filter chips instead.
 */
export function CollectionsOverview({
  libraryBookmarkCount,
  organizedBookmarkCount,
  isLibraryStatsLoading = false,
  publicCollections,
  emptyCollections,
  onOrganizeUnshelved,
}: CollectionsOverviewProps) {
  const unorganizedCount = Math.max(
    0,
    (libraryBookmarkCount ?? organizedBookmarkCount) - organizedBookmarkCount
  );
  const loadingValue = (
    <span className="inline-block h-6 w-14 rounded-sm skeleton-shimmer" />
  );

  return (
    <section
      aria-label="Collections overview"
      className="flex flex-wrap items-end justify-between gap-4"
    >
      <dl
        className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4"
        aria-busy={isLibraryStatsLoading}
      >
        <StatRow
          label="In a collection"
          value={
            isLibraryStatsLoading
              ? loadingValue
              : organizedBookmarkCount.toLocaleString()
          }
        />
        <StatRow
          label="Not in a collection"
          value={
            isLibraryStatsLoading
              ? loadingValue
              : unorganizedCount.toLocaleString()
          }
        />
        <StatRow label="Public" value={publicCollections.toLocaleString()} />
        <StatRow label="Empty" value={emptyCollections.toLocaleString()} />
      </dl>

      {!isLibraryStatsLoading && unorganizedCount > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={onOrganizeUnshelved}
        >
          Organize in Orbit
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}
    </section>
  );
}
