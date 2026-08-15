"use client";

import { forwardRef, type ReactNode } from "react";
import {
  CheckSquare,
  Loader2,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";
import { OrbitPageIdentity } from "@/components/orbit/orbit-page-identity";
import { OrbitModeSwitch } from "@/components/orbit/orbit-mode-switch";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/search-bar";
import { ScrollingProgressBar } from "@/components/ui/scrolling-progress-bar";
import { KeyboardShortcutsHelpButton } from "@/components/keyboard-shortcuts-help-button";
import { OrbitBatchMenu } from "@/components/orbit/orbit-batch-menu";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { ToolbarIconButton, ToolbarSegmentControl } from "@/components/toolbar/toolbar-primitives";
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
  appToolbarSurfaceGroupClassName,
} from "@/lib/app-chrome";
import { orbitControlRadius, orbitDataClass } from "@/lib/orbit-route-chrome";
import {
  type OrbitScanBatchMode,
  type OrbitScanBatchProfileId,
} from "@/lib/orbit-config";
import {
  ORBIT_RECENT_PAGE_SIZE,
  type OrbitSortDirection,
  type OrbitView,
} from "@/lib/orbit-navigation";
import type { KeyboardShortcutGroup } from "@/hooks/use-keyboard-shortcuts";
import { PageHeaderCompactToggle } from "@/components/page-header-compact-toggle";
import { CompactFloatingSearchBubble } from "@/components/compact-floating-search";
import { usePageHeaderCompact } from "@/hooks/use-page-header-compact";
import type { DbUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface OrbitCommandBarProps {
  mobileSidebar?: ReactNode;
  user?: DbUser;

  // Scope
  orbitView: OrbitView;
  total: number;
  sortDirection: OrbitSortDirection;
  onChangeView: (view: OrbitView) => void;
  onChangeSortDirection: (direction: OrbitSortDirection) => void;
  canSelect: boolean;
  selectionMode: boolean;
  onToggleSelectionMode: () => void;

  // Triage progress (this pass)
  triagedCount: number;
  passTotal: number;

  // Action / scan
  scanButtonLabel: string;
  queueIsLoading: boolean;
  scanning: boolean;
  scanTargetCount: number;
  hasScanPlan: boolean;
  batchMode: OrbitScanBatchMode;
  resolvedBatchProfile: OrbitScanBatchProfileId;
  deepUnlocked: boolean;
  deepLockedReason: string;
  mapHref: string;
  onBatchModeChange: (mode: OrbitScanBatchMode) => void;
  onScan: () => void;
  scanError?: ReactNode;

  // Utility
  search: string;
  onSearchChange: (value: string) => void;
  visibleStatusLabel: string;
  isUpdating: boolean;
  keyboardShortcutsOpen: boolean;
  onKeyboardShortcutsOpenChange: (open: boolean) => void;
  shortcutGroups: KeyboardShortcutGroup[];
}

const countBadgeClass =
  "text-2xs font-medium tabular-nums text-muted-foreground/80";

export const OrbitCommandBar = forwardRef<HTMLInputElement, OrbitCommandBarProps>(
  function OrbitCommandBar(
    {
      mobileSidebar,
      user,
      orbitView,
      total,
      sortDirection,
      onChangeView,
      onChangeSortDirection,
      canSelect,
      selectionMode,
      onToggleSelectionMode,
      triagedCount,
      passTotal,
      scanButtonLabel,
      queueIsLoading,
      scanning,
      scanTargetCount,
      hasScanPlan,
      batchMode,
      resolvedBatchProfile,
      deepUnlocked,
      deepLockedReason,
      mapHref,
      onBatchModeChange,
      onScan,
      scanError,
      search,
      onSearchChange,
      visibleStatusLabel,
      isUpdating,
      keyboardShortcutsOpen,
      onKeyboardShortcutsOpenChange,
      shortcutGroups,
    },
    searchRef
  ) {
    const scanBusy = queueIsLoading || scanning;
    const { compact } = usePageHeaderCompact();
    const recentCount = Math.min(total, ORBIT_RECENT_PAGE_SIZE);

    const searchField = (
      <FeedSearchFieldShell embedded={compact}>
        <SearchBar
          ref={searchRef}
          glass
          value={search}
          onChange={onSearchChange}
          placeholder="Search Orbit by author, text, or notes…"
          inputClassName="h-9"
        />
      </FeedSearchFieldShell>
    );

    const showTriageProgress = passTotal > 0 && triagedCount > 0;

    const userNav = user ? (
      <UserNavDynamic user={user} avatarSize={compact ? "default" : "xl"} />
    ) : null;

    const scopeControls = canSelect ? (
      <>
        <ToolbarSegmentControl
          value={orbitView}
          onChange={onChangeView}
          aria-label="Queue scope"
          variant="library"
          size={compact ? "sm" : "md"}
          className={appToolbarSurfaceGroupClassName}
          options={[
            {
              value: "recent",
              label: "Recent",
              badge: (
                <span className={countBadgeClass}>
                  {recentCount.toLocaleString()}
                </span>
              ),
            },
            {
              value: "all",
              label: "All",
              badge: (
                <span className={countBadgeClass}>{total.toLocaleString()}</span>
              ),
            },
          ]}
        />
        <ToolbarSegmentControl
          value={sortDirection}
          onChange={onChangeSortDirection}
          aria-label="Queue sort"
          variant="library"
          size={compact ? "sm" : "md"}
          className={appToolbarSurfaceGroupClassName}
          options={[
            { value: "desc", label: "Newest" },
            { value: "asc", label: "Oldest" },
          ]}
        />
      </>
    ) : null;

    const toolbarActions = canSelect ? (
      <>
        {hasScanPlan ? (
          <ToolbarIconButton
            label={scanButtonLabel}
            icon={RefreshCw}
            disabled={scanBusy || scanTargetCount === 0}
            onClick={onScan}
            size={compact ? "compact" : "default"}
            className={appToolbarSurfaceClassName}
          />
        ) : (
          <div className="flex items-center gap-1.5">
            <Button
              variant="highlight"
              size="sm"
              className={cn(
                "gap-1.5 px-2.5 text-xs",
                appToolbarControlHeightClassName(compact),
                orbitControlRadius()
              )}
              disabled={scanBusy || scanTargetCount === 0}
              onClick={onScan}
            >
              {scanBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <GrokMark className="size-3.5" title="Grok" />
              )}
              <span className="hidden sm:inline">{scanButtonLabel}</span>
              <span className="sm:hidden">Scan</span>
            </Button>
            <OrbitBatchMenu
              batchMode={batchMode}
              resolvedBatchProfile={resolvedBatchProfile}
              deepUnlocked={deepUnlocked}
              deepLockedReason={deepLockedReason}
              disabled={scanBusy}
              onBatchModeChange={onBatchModeChange}
            />
          </div>
        )}
        <OrbitModeSwitch
          active="queue"
          size={compact ? "sm" : "md"}
          mapHref={mapHref}
          className={appToolbarSurfaceClassName}
        />
        <div className="hidden sm:contents">
          <ToolbarIconButton
            active={selectionMode}
            pressed={selectionMode}
            label={
              selectionMode ? "Exit selection mode" : "Enter selection mode"
            }
            icon={CheckSquare}
            onClick={onToggleSelectionMode}
            size={compact ? "compact" : "default"}
            className={appToolbarSurfaceClassName}
          />
          <KeyboardShortcutsHelpButton
            open={keyboardShortcutsOpen}
            onOpenChange={onKeyboardShortcutsOpenChange}
            groups={shortcutGroups}
            description="Orbit queue navigation and review actions."
            toolbarSize={compact ? "compact" : "default"}
          />
          <PageHeaderCompactToggle
            className={cn(
              appToolbarSurfaceClassName,
              !compact && appToolbarControlExpandedClassName
            )}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More Orbit tools"
            className={cn(
              "inline-flex items-center justify-center rounded-sm border border-hairline-strong bg-background/35 text-muted-foreground hover:bg-accent-soft hover:text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45 sm:hidden",
              compact ? "size-8" : "size-9",
              appToolbarSurfaceClassName
            )}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={onToggleSelectionMode}>
              <CheckSquare />
              {selectionMode ? "Exit selection mode" : "Select bookmarks"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onKeyboardShortcutsOpenChange(true)}>
              Keyboard shortcuts
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    ) : null;

    const scanProgress = scanning ? (
      <ScrollingProgressBar className="absolute inset-x-0 top-0" />
    ) : null;

    const scanErrorBlock = scanError ? (
      <div
        className={cn(
          "mt-2 rounded-sm border border-hairline-soft p-3",
          compact && "mx-4 sm:mx-5",
          appToolbarSurfaceClassName
        )}
      >
        {scanError}
      </div>
    ) : null;

    const statusRow =
      canSelect && !compact ? (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 px-0.5 text-xs text-muted-foreground">
          <span className={cn(orbitDataClass(), "normal-case")}>
            {visibleStatusLabel}
          </span>
          {showTriageProgress ? (
            <span className={cn(orbitDataClass(), "normal-case")}>
              {triagedCount} / {passTotal} triaged
            </span>
          ) : null}
          {isUpdating ? (
            <span className="flex shrink-0 items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              Updating…
            </span>
          ) : null}
        </div>
      ) : null;

    if (compact) {
      return (
        <>
          <FeedCompactToolbarShell>
            {canSelect ? (
              <FeedToolbarRow
                leading={
                  <>
                {mobileSidebar ? (
                  <div className="shrink-0 md:hidden">
                    {withCompactToolbarSidebar(mobileSidebar, compact)}
                  </div>
                ) : null}
                    {scopeControls}
                  </>
                }
                actions={toolbarActions}
                userNav={userNav}
                progress={scanProgress}
                aria-busy={scanning}
              />
            ) : null}
          </FeedCompactToolbarShell>
          <CompactFloatingSearchBubble>{searchField}</CompactFloatingSearchBubble>
          {scanErrorBlock}
        </>
      );
    }

    return (
      <div
        className={cn(
          "feed-toolbar relative w-full min-w-0 space-y-1.5 py-2",
          appContentGutterClassName
        )}
        aria-busy={scanning}
      >
        {scanProgress}
        <FeedToolbarSearchRow
          leading={
            <>
                {mobileSidebar ? (
                  <div className="shrink-0 md:hidden">
                    {withCompactToolbarSidebar(mobileSidebar, compact)}
                  </div>
                ) : null}
              <OrbitPageIdentity queueTotal={total} />
            </>
          }
          search={searchField}
          userNav={userNav}
        />
        {canSelect ? (
          <FeedToolbarControlsRow
            leading={scopeControls}
            actions={toolbarActions}
            mobileUserNav={userNav}
          />
        ) : null}
        {statusRow}
        {scanErrorBlock}
      </div>
    );
  }
);
