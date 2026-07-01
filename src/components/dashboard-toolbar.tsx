"use client";

import type { RefObject, ReactNode } from "react";
import { CheckSquare, Compass, Keyboard, SlidersHorizontal } from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { SortControls } from "@/components/sort-controls";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import {
  FeedCompactToolbarShell,
  FeedSearchFieldShell,
  FeedToolbarControlsRow,
  FeedToolbarRow,
  FeedToolbarSearchRow,
  withCompactToolbarSidebar,
} from "@/components/feed-toolbar-layout";
import {
  appContentGutterClassName,
  appToolbarControlExpandedClassName,
  appToolbarControlHeightClassName,
  appToolbarSurfaceClassName,
} from "@/lib/app-chrome";
import { PageHeaderCompactToggle } from "@/components/page-header-compact-toggle";
import { CompactFloatingSearchBubble } from "@/components/compact-floating-search";
import { useDiscoveryHidden } from "@/hooks/use-discovery-hidden";
import { usePageHeaderCompact } from "@/hooks/use-page-header-compact";
import { cn } from "@/lib/utils";
import { ToolbarIconButton } from "@/components/toolbar/toolbar-primitives";
import {
  highlightActiveClass,
  highlightInteractiveClass,
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
  discoveryAvailable?: boolean;
  discoveryUntouchedCount?: number;
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
  discoveryAvailable = false,
  discoveryUntouchedCount = 0,
}: DashboardToolbarProps) {
  const { compact } = usePageHeaderCompact();
  const { hidden: discoveryHidden, setHidden: setDiscoveryHidden } =
    useDiscoveryHidden();
  const showDiscovery = !discoveryHidden;
  const discoveryCountLabel =
    discoveryUntouchedCount > 0
      ? ` (${discoveryUntouchedCount.toLocaleString()} untouched)`
      : "";

  const searchField = (
    <FeedSearchFieldShell embedded={compact}>
      <SearchBar
        ref={searchInputRef}
        glass
        value={search}
        onChange={onSearchChange}
        placeholder="Search bookmarks, authors, notes..."
        inputClassName="h-9"
      />
    </FeedSearchFieldShell>
  );

  const primaryFilterChip = (
    <button
      type="button"
      onClick={onResetPrimaryFilter}
      aria-label={`${primaryFilterLabel} (${total.toLocaleString()})`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border border-l-2 border-l-primary px-2.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
        appToolbarControlHeightClassName(compact),
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
        appToolbarControlHeightClassName(compact),
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
          size={compact ? "compact" : "default"}
          className={appToolbarSurfaceClassName}
        />
      </div>

      {discoveryAvailable ? (
        <ToolbarIconButton
          active={showDiscovery}
          label={
            showDiscovery
              ? `Hide Discovery${discoveryCountLabel}`
              : `Show Discovery${discoveryCountLabel}`
          }
          icon={Compass}
          onClick={() => setDiscoveryHidden(!discoveryHidden)}
          pressed={showDiscovery}
          aria-controls="dashboard-discovery-panel"
          showIndicator={discoveryHidden}
          size={compact ? "compact" : "default"}
          className={appToolbarSurfaceClassName}
        />
      ) : null}

      <ToolbarIconButton
        label="Keyboard shortcuts"
        icon={Keyboard}
        onClick={onOpenKeyboardShortcuts}
        size={compact ? "compact" : "default"}
        className={appToolbarSurfaceClassName}
      />

      <ToolbarIconButton
        active={selectionMode}
        label={selectionMode ? "Exit selection mode" : "Enter selection mode"}
        icon={CheckSquare}
        onClick={onToggleSelectionMode}
        pressed={selectionMode}
        size={compact ? "compact" : "default"}
        className={appToolbarSurfaceClassName}
      />

      <SortControls
        compact
        sortField={sortField}
        viewMode={viewMode}
        onSortFieldChange={onSortFieldChange}
        onViewModeChange={onViewModeChange}
      />

      <PageHeaderCompactToggle
        className={cn(
          appToolbarSurfaceClassName,
          !compact && appToolbarControlExpandedClassName
        )}
      />
    </>
  );

  const userNav = user ? (
    <UserNavDynamic user={user} avatarSize={compact ? "default" : "xl"} />
  ) : null;

  if (compact) {
    return (
      <>
        <FeedCompactToolbarShell>
          <FeedToolbarRow
            leading={
              <>
                <div className="shrink-0 md:hidden">
                  {withCompactToolbarSidebar(mobileSidebar, compact)}
                </div>
                {filterChips}
              </>
            }
            actions={toolbarActions}
            userNav={userNav}
          />
        </FeedCompactToolbarShell>
        <CompactFloatingSearchBubble>{searchField}</CompactFloatingSearchBubble>
      </>
    );
  }

  return (
    <div className={cn("feed-toolbar py-2", appContentGutterClassName)}>
      <FeedToolbarSearchRow
        leading={
          <div className="shrink-0 md:hidden">
            {withCompactToolbarSidebar(mobileSidebar, compact)}
          </div>
        }
        search={searchField}
        userNav={userNav}
      />
      <FeedToolbarControlsRow
        leading={filterChips}
        actions={toolbarActions}
        mobileUserNav={userNav}
      />
    </div>
  );
}
