import { Search, X } from "lucide-react";
import type { RefObject } from "react";

import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/chip";
import type { CollectionFilter } from "@/lib/collections-presentation";

type CollectionsControlBarProps = {
  searchQuery: string;
  activeFilter: CollectionFilter;
  totalCount: number;
  userCount: number;
  publicCount: number;
  xFolderCount: number;
  filteredCount: number;
  hasActiveFilters: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: CollectionFilter) => void;
  onClear: () => void;
};

export function CollectionsControlBar({
  searchQuery,
  activeFilter,
  totalCount,
  userCount,
  publicCount,
  xFolderCount,
  filteredCount,
  hasActiveFilters,
  searchInputRef,
  onSearchChange,
  onFilterChange,
  onClear,
}: CollectionsControlBarProps) {
  const filters: Array<{
    value: CollectionFilter;
    label: string;
    count: number;
  }> = [
    { value: "all", label: "All", count: totalCount },
    { value: "mine", label: "Mine", count: userCount },
    { value: "public", label: "Public", count: publicCount },
    { value: "x_folders", label: "X", count: xFolderCount },
  ];

  return (
    <section className="flex flex-col gap-3 border-y border-hairline-soft py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-sm border border-hairline-strong bg-background/35 px-3 text-sm text-muted-foreground focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/45 lg:max-w-md">
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <input
          ref={searchInputRef}
          aria-label="Search collections"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search collections..."
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        {searchQuery ? (
          <button
            type="button"
            className="rounded-sm border border-transparent p-1 text-muted-foreground transition-colors hover:bg-accent-soft hover:text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div
          aria-label="Collection filters"
          className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-sm border border-hairline-soft bg-background/35 p-0.5"
        >
          {filters.map((filter) => {
            const active = filter.value === activeFilter;
            return (
              <FilterChip
                key={filter.value}
                active={active}
                onClick={() => onFilterChange(filter.value)}
              >
                <span>{filter.label}</span>
                <span
                  className={`tabular-nums ${
                    active
                      ? "text-muted-foreground/80"
                      : "text-muted-foreground/60"
                  }`}
                >
                  {filter.count}
                </span>
              </FilterChip>
            );
          })}
        </div>

        <span className="text-xs tabular-nums text-muted-foreground/70">
          {filteredCount.toLocaleString()} shown
        </span>

        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
            onClick={onClear}
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        ) : null}
      </div>
    </section>
  );
}
