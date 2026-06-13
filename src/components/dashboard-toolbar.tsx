"use client";

import type { RefObject, ReactNode } from "react";
import { CheckSquare, Keyboard, SlidersHorizontal } from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { SortControls } from "@/components/sort-controls";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import {
  appContentGutterClassName,
  appToolbarSurfaceClassName,
  appToolbarSurfaceShellClassName,
} from "@/lib/app-chrome";
import { PageHeaderCompactToggle } from "@/components/page-header-compact-toggle";
import {
  CompactFloatingSearchStrip,
  CompactSearchTrigger,
} from "@/components/compact-floating-search";
import { useCompactFloatingSearch } from "@/hooks/use-compact-floating-search";
import { usePageHeaderCompact } from "@/hooks/use-page-header-compact";
import { cn } from "@/lib/utils";
import { ToolbarIconButton } from "@/components/toolbar/toolbar-primitives";
import {
  highlightActiveClass,
  highlightInteractiveClass,
  highlightSearchShellClass,
} from "@/lib/highlight-chrome";
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
  onOpenKeyboardShortcuts: () => void;
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
  onOpenKeyboardShortcuts,
  sortField,
  viewMode,
  onSortFieldChange,
  onViewModeChange,
  user,
}: DashboardToolbarProps) {
  const { compact } = usePageHeaderCompact();
  const { expanded: searchExpanded, toggle: toggleSearch, closeIfEmpty } =
    useCompactFloatingSearch(compact, search, searchInputRef);
  const hasSearchQuery = search.trim().length > 0;

  const searchField = (
    <div className={cn(highlightSearchShellClass, appToolbarSurfaceShellClassName)}>
      <SearchBar
        ref={searchInputRef}
        glass
        value={search}
        onChange={onSearchChange}
        placeholder="Search bookmarks, authors, notes..."
        inputClassName={compact ? "h-8" : "h-9"}
      />
    </div>
  );

  const primaryFilterChip = (
    <button
      type="button"
      onClick={onResetPrimaryFilter}
      aria-label={`${primaryFilterLabel} (${total.toLocaleString()})`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border border-l-2 border-l-primary px-2.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
        compact ? "h-7" : "h-8",
        highlightActiveClass,
        highlightInteractiveClass
      )}
    >
      <span className="hidden sm:inline">{primaryFilterLabel}</span>
      <span className="sm:hidden">{primaryFilterCompactLabel}</span>
      <span className="tabular-nums text-2xs font-medium text-muted-foreground">
        {total.toLocaleString()}
      </span>
    </button>
  );

  const tagFilterChips = selectedTagEntries.map((tag) => (
    <button
      key={tag.id}
      type="button"
      onClick={() => onTagToggle(tag.id)}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-sm border px-2.5 text-xs font-semibold",
        compact ? "h-7" : "h-8",
        highlightActiveClass,
        highlightInteractiveClass
      )}
    >
      #{tag.name}
      <span className="text-primary/60" aria-hidden>
        ×
      </span>
    </button>
  ));

  const filterChips = (
    <>
      {primaryFilterChip}
      {tagFilterChips}
    </>
  );

  const toolbarActions = (
    <>
      <div className="relative">
        <ToolbarIconButton
          active={showFilters}
          label={showFilters ? "Hide filters" : "Show filters"}
          icon={SlidersHorizontal}
          onClick={onToggleFilters}
          pressed={showFilters}
          aria-controls="dashboard-filter-panel"
          showIndicator={hasActiveFilters}
          className={cn(appToolbarSurfaceClassName, compact && "size-8")}
        />
      </div>

      <ToolbarIconButton
        label="Keyboard shortcuts"
        icon={Keyboard}
        onClick={onOpenKeyboardShortcuts}
        className={cn(appToolbarSurfaceClassName, compact && "size-8")}
      />

      <ToolbarIconButton
        active={selectionMode}
        label={selectionMode ? "Exit selection mode" : "Enter selection mode"}
        icon={CheckSquare}
        onClick={onToggleSelectionMode}
        pressed={selectionMode}
        className={cn(appToolbarSurfaceClassName, compact && "size-8")}
      />

      <SortControls
        compact
        sortField={sortField}
        viewMode={viewMode}
        onSortFieldChange={onSortFieldChange}
        onViewModeChange={onViewModeChange}
      />

      <PageHeaderCompactToggle
        className={cn(appToolbarSurfaceClassName, compact ? "size-8" : "size-9")}
      />

      {user ? (
        <div className={cn("shrink-0", !compact && "sm:hidden")}>
          <UserNavDynamic user={user} />
        </div>
      ) : null}
    </>
  );

  if (compact) {
    return (
      <div
        className={cn("dashboard-toolbar min-w-0 py-1", appContentGutterClassName)}
        data-compact-search-expanded={searchExpanded ? "" : undefined}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] md:max-w-[38%] md:shrink [&::-webkit-scrollbar]:hidden">
            <div className="shrink-0 md:hidden">{mobileSidebar}</div>
            {primaryFilterChip}
            {tagFilterChips}
          </div>

          <CompactSearchTrigger
            onToggle={toggleSearch}
            expanded={searchExpanded}
            hasQuery={hasSearchQuery}
          />

          <div className="flex min-w-0 shrink-0 items-center justify-end gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {toolbarActions}
          </div>
        </div>

        <CompactFloatingSearchStrip
          expanded={searchExpanded}
          search={search}
          onSearchChange={onSearchChange}
          searchInputRef={searchInputRef}
          placeholder="Search bookmarks, authors, notes..."
          onCloseIfEmpty={closeIfEmpty}
        />
      </div>
    );
  }

  return (
    <div className={cn("dashboard-toolbar py-2", appContentGutterClassName)}>
      <div className="flex items-center gap-2">
        <div className="shrink-0 md:hidden">{mobileSidebar}</div>

        <div className="min-w-0 flex-1">{searchField}</div>

        {user ? (
          <div className="hidden shrink-0 sm:block">
            <UserNavDynamic user={user} />
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filterChips}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">{toolbarActions}</div>
      </div>
    </div>
  );
}
