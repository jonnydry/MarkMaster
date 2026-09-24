"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { useRelativeTime } from "@/hooks/use-relative-time";
import { BookmarkTagChip } from "@/components/bookmark-card-chrome";
import { StatRow } from "@/components/ui/stat-row";
import { fetchJson } from "@/lib/fetch-json";
import { topAuthorsResponseSchema } from "@/lib/api-response-schemas";
import { cn } from "@/lib/utils";
import { useTypography } from "@/hooks/use-typography";
import type { LibraryStats } from "@/hooks/use-library-data";
import type { MediaFilter, TagWithCount, TopAuthorsResponse } from "@/types";

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
  dataUnavailable?: boolean;
}

const TOP_TAG_LIMIT = 8;
const TOP_AUTHOR_LIMIT = 6;

function RailSection({
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
    <section className="border-b border-hairline-soft py-4 last:border-b-0">
      <div className="mb-2.5 flex items-center justify-between gap-2">
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
  dataUnavailable = false,
}: DashboardRailProps) {
  const t = useTypography();
  const lastSyncRelative = useRelativeTime(lastSyncAt);

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

  const {
    data: authorsPayload,
    isLoading: authorsLoading,
    isError: authorsError,
  } = useQuery<TopAuthorsResponse>({
    queryKey: ["analytics", "top-authors"],
    queryFn: () =>
      fetchJson(
        "/api/analytics/top-authors",
        undefined,
        topAuthorsResponseSchema
      ),
    staleTime: 5 * 60 * 1000,
    enabled: active,
  });
  const topAuthors = authorsPayload?.topAuthors.slice(0, TOP_AUTHOR_LIMIT) ?? [];

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
    <div id={id} className="pb-6 pr-1" aria-label="Dashboard rail">
      <RailSection title="Library health">
        {dataUnavailable ? (
          <p className="text-xs leading-5 text-muted-foreground" role="status">
            Library details are temporarily unavailable. Your bookmark feed is unchanged.
          </p>
        ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
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
            value={lastSyncAt ? (lastSyncRelative ?? "—") : "Never"}
          />
        </dl>
        )}
      </RailSection>


      {topTags.length > 0 ? (
        <RailSection title="Top tags">
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
        </RailSection>
      ) : null}

      <RailSection title="Top authors">
        {authorsLoading ? (
          <div className="space-y-2" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton-shimmer h-6 rounded-[2px]" />
            ))}
          </div>
        ) : authorsError ? (
          <p className="text-xs text-muted-foreground" role="status">
            Authors are temporarily unavailable.
          </p>
        ) : topAuthors.length > 0 ? (
          <ul className="space-y-0.5">
            {topAuthors.map((author) => (
              <li key={author.author}>
                <button
                  type="button"
                  onClick={() => filters.setAuthorFilter(author.author)}
                  className="flex w-full items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 text-left text-sm transition-colors hover:bg-hover focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
                >
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    @{author.author}
                  </span>
                  {author.verified ? (
                    <BadgeCheck className="size-3.5 shrink-0 text-primary" aria-label="Verified" />
                  ) : null}
                  <span className={cn("shrink-0 text-xs text-muted-foreground", t.data)}>
                    {author.count.toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            No authors yet.
          </p>
        )}
      </RailSection>
    </div>
  );
}
