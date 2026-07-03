"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { BadgeCheck } from "lucide-react";
import { FilterPanel } from "@/components/filter-panel";
import { BookmarkTagChip } from "@/components/bookmark-card-chrome";
import { StatRow } from "@/components/ui/stat-row";
import { fetchJson } from "@/lib/fetch-json";
import { analyticsDataSchema } from "@/lib/api-response-schemas";
import { cn } from "@/lib/utils";
import { useTypography } from "@/hooks/use-typography";
import type { LibraryStats } from "@/hooks/use-library-data";
import type { AnalyticsData, MediaFilter, TagWithCount } from "@/types";

/** The subset of dashboard filter state the rail needs (matches useDashboardPage). */
export interface DashboardRailFilters {
  mediaFilter: MediaFilter;
  setMediaFilter: (filter: MediaFilter) => void;
  authorFilter: string;
  setAuthorFilter: (author: string) => void;
  dateFrom: string;
  dateTo: string;
  setDateFrom: (date: string) => void;
  setDateTo: (date: string) => void;
  selectedTags: string[];
  toggleTag: (tagId: string) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
}

interface DashboardRailProps {
  id?: string;
  filters: DashboardRailFilters;
  tags: TagWithCount[];
  libraryStats: LibraryStats | undefined;
  total: number;
  untouchedCount: number;
  collectionCount: number;
  lastSyncAt: Date | null;
  /** Only fetch top authors when the rail is actually visible (open on a wide viewport). */
  active: boolean;
}

const TOP_TAG_LIMIT = 8;
const TOP_AUTHOR_LIMIT = 6;

function RailCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTypography();
  return (
    <section className="surface-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className={cn(t.sectionLabel, "mb-0")}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DashboardRail({
  id,
  filters,
  tags,
  libraryStats,
  total,
  untouchedCount,
  collectionCount,
  lastSyncAt,
  active,
}: DashboardRailProps) {
  const t = useTypography();

  const libraryTotal = libraryStats?.libraryBookmarkCount ?? total;
  const organized = libraryStats?.organizedBookmarkCount;
  const organizedPct =
    organized !== undefined && libraryTotal > 0
      ? Math.round((organized / libraryTotal) * 100)
      : undefined;

  const topTags = useMemo(
    () =>
      [...tags]
        .sort((a, b) => b._count.bookmarks - a._count.bookmarks)
        .slice(0, TOP_TAG_LIMIT),
    [tags]
  );

  const { data: analytics, isLoading: authorsLoading } = useQuery<AnalyticsData>({
    queryKey: ["analytics", "all"],
    queryFn: () =>
      fetchJson("/api/analytics?range=all", undefined, analyticsDataSchema),
    staleTime: 5 * 60 * 1000,
    enabled: active,
  });
  const topAuthors = analytics?.topAuthors.slice(0, TOP_AUTHOR_LIMIT) ?? [];

  const statValue = (value: string | number | undefined) =>
    libraryStats === undefined ? (
      <span
        className="skeleton-shimmer inline-block h-4 w-8 rounded-[2px] align-middle"
        aria-hidden
      />
    ) : (
      value
    );

  return (
    <div id={id} className="space-y-3 pt-3 pb-6 pr-1" aria-label="Dashboard rail">
      <RailCard title="Library health">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <StatRow size="sm" headingFont={false} label="Total" value={statValue(libraryTotal.toLocaleString())} />
          <StatRow
            size="sm"
            headingFont={false}
            label="Organized"
            value={statValue(organizedPct !== undefined ? `${organizedPct}%` : "—")}
          />
          <StatRow size="sm" headingFont={false} label="Untouched" value={untouchedCount.toLocaleString()} />
          <StatRow size="sm" headingFont={false} label="Collections" value={collectionCount.toLocaleString()} />
          <StatRow
            size="sm"
            headingFont={false}
            tabularNums={false}
            label="Last sync"
            value={
              lastSyncAt
                ? formatDistanceToNow(lastSyncAt, { addSuffix: true })
                : "Never"
            }
          />
        </dl>
      </RailCard>

      <RailCard title="Filters">
        <FilterPanel
          variant="rail"
          mediaFilter={filters.mediaFilter}
          onMediaFilterChange={filters.setMediaFilter}
          authorFilter={filters.authorFilter}
          onAuthorFilterChange={filters.setAuthorFilter}
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          onDateFromChange={filters.setDateFrom}
          onDateToChange={filters.setDateTo}
          selectedTags={filters.selectedTags}
          onTagToggle={filters.toggleTag}
          tags={tags}
          onClearAll={filters.clearFilters}
          hasActiveFilters={filters.hasActiveFilters}
        />
      </RailCard>

      {topTags.length > 0 ? (
        <RailCard title="Top tags">
          <div className="flex flex-wrap gap-1.5">
            {topTags.map((tag) => (
              <BookmarkTagChip
                key={tag.id}
                name={tag.name}
                color={tag.color}
                extraCount={tag._count.bookmarks}
                density="strong"
                uppercase={false}
                onClick={() => filters.toggleTag(tag.id)}
              />
            ))}
          </div>
        </RailCard>
      ) : null}

      <RailCard title="Top authors">
        {authorsLoading ? (
          <div className="space-y-2" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton-shimmer h-6 rounded-[2px]" />
            ))}
          </div>
        ) : topAuthors.length > 0 ? (
          <ul className="space-y-0.5">
            {topAuthors.map((author) => (
              <li key={author.author}>
                <button
                  type="button"
                  onClick={() => filters.setAuthorFilter(author.author)}
                  className="flex w-full items-center gap-2 rounded-sm border border-transparent px-2 py-1 text-left text-sm transition-colors hover:border-hairline-soft hover:bg-accent-soft/50 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
                >
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    @{author.author}
                  </span>
                  {author.verified ? (
                    <BadgeCheck className="size-3.5 shrink-0 text-primary" aria-label="Verified" />
                  ) : null}
                  <span className={cn("shrink-0 text-xs text-muted-foreground/60", t.data)}>
                    {author.count.toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 text-xs text-muted-foreground">
            No authors yet.
          </p>
        )}
      </RailCard>
    </div>
  );
}
