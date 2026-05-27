"use client";

import type { RefObject, ReactNode } from "react";
import { CheckSquare, SlidersHorizontal } from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { SortControls } from "@/components/sort-controls";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { appContentGutterClassName } from "@/lib/app-chrome";
import { cn } from "@/lib/utils";
import { ToolbarIconButton } from "@/components/toolbar/toolbar-primitives";
import type { DbUser } from "@/lib/auth";
import type { SortField, TagWithCount, ViewMode } from "@/types";

interface DashboardToolbarProps {
  mobileSidebar: ReactNode;
  search: string;
  onSearchChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  primaryFilterLabel: string;
  primaryFilterCompactLabel: string;
  total: number;
  onResetPrimaryFilter: () => void;
  selectedTagEntries: TagWithCount[];
  onTagToggle: (tagId: string) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  hasActiveFilters: boolean;
  selectionMode: boolean;
  onToggleSelectionMode: () => void;
  sortField: SortField;
  viewMode: ViewMode;
  onSortFieldChange: (field: SortField) => void;
  onViewModeChange: (mode: ViewMode) => void;
  user?: DbUser;
}

export function DashboardToolbar({
  mobileSidebar,
  search,
  onSearchChange,
  searchInputRef,
  primaryFilterLabel,
  primaryFilterCompactLabel,
  total,
  onResetPrimaryFilter,
  selectedTagEntries,
  onTagToggle,
  showFilters,
  onToggleFilters,
  hasActiveFilters,
  selectionMode,
  onToggleSelectionMode,
  sortField,
  viewMode,
  onSortFieldChange,
  onViewModeChange,
  user,
}: DashboardToolbarProps) {
  return (
    <div className={cn("dashboard-toolbar py-2", appContentGutterClassName)}>
      <div className="flex items-center gap-2">
        <div className="shrink-0 md:hidden">{mobileSidebar}</div>

        <div className="min-w-0 flex-1">
          <div className="overflow-hidden rounded-sm border border-hairline-strong bg-background/35 shadow-[0_18px_44px_-34px_color-mix(in_srgb,var(--foreground)_80%,transparent)]">
            <SearchBar
              ref={searchInputRef}
              glass
              value={search}
              onChange={onSearchChange}
              placeholder="Search bookmarks, authors, notes..."
              inputClassName="h-9"
            />
          </div>
        </div>

        {user ? (
          <div className="hidden shrink-0 sm:block">
            <UserNavDynamic user={user} />
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={onResetPrimaryFilter}
            aria-label={`${primaryFilterLabel} (${total.toLocaleString()})`}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-hairline-strong border-l-2 border-l-primary bg-background/35 px-2.5 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <span className="hidden sm:inline">{primaryFilterLabel}</span>
            <span className="sm:hidden">{primaryFilterCompactLabel}</span>
            <span className="tabular-nums text-[10px] font-medium text-muted-foreground">
              {total.toLocaleString()}
            </span>
          </button>

          {selectedTagEntries.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => onTagToggle(tag.id)}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-primary/15"
            >
              #{tag.name}
              <span className="text-primary/60" aria-hidden>
                ×
              </span>
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <div className="relative">
            <ToolbarIconButton
              active={showFilters}
              label={showFilters ? "Hide filters" : "Show filters"}
              icon={SlidersHorizontal}
              onClick={onToggleFilters}
              pressed={showFilters}
              aria-controls="dashboard-filter-panel"
              showIndicator={hasActiveFilters}
            />
          </div>

          <ToolbarIconButton
            active={selectionMode}
            label={selectionMode ? "Exit selection mode" : "Enter selection mode"}
            icon={CheckSquare}
            onClick={onToggleSelectionMode}
            pressed={selectionMode}
          />

          <SortControls
            compact
            sortField={sortField}
            viewMode={viewMode}
            onSortFieldChange={onSortFieldChange}
            onViewModeChange={onViewModeChange}
          />

          {user ? (
            <div className="shrink-0 sm:hidden">
              <UserNavDynamic user={user} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
