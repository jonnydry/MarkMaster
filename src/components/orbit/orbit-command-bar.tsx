"use client";

import { forwardRef, type ReactNode } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  CheckSquare,
  ListChecks,
  Loader2,
  Map as MapIcon,
  RefreshCw,
} from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";
import { OrbitPageIdentity } from "@/components/orbit/orbit-page-identity";
import { Button, buttonVariants } from "@/components/ui/button";
import { SearchBar } from "@/components/search-bar";
import { ScrollingProgressBar } from "@/components/ui/scrolling-progress-bar";
import { KeyboardShortcutsHelpButton } from "@/components/keyboard-shortcuts-help-button";
import { OrbitBatchMenu } from "@/components/orbit/orbit-batch-menu";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { ToolbarIconButton, ToolbarSegmentControl } from "@/components/toolbar/toolbar-primitives";
import {
  appContentGutterClassName,
  appFeedHeaderFrostedClassName,
  appToolbarSurfaceClassName,
  appToolbarSurfaceGroupClassName,
  appToolbarSurfaceShellClassName,
} from "@/lib/app-chrome";
import { highlightSearchShellClass } from "@/lib/highlight-chrome";
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
  scanPlanSuggestionCount: number;
  batchMode: OrbitScanBatchMode;
  resolvedBatchProfile: OrbitScanBatchProfileId;
  deepUnlocked: boolean;
  deepLockedReason: string;
  applyingBatch: boolean;
  canApplyStrongMatches: boolean;
  mapHref: string;
  onBatchModeChange: (mode: OrbitScanBatchMode) => void;
  onScan: () => void;
  onApplyStrongMatches: () => void;
  onReviewPass: () => void;
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

/**
 * Dashboard-native Orbit toolbar — search strip in the sticky header, compact
 * scope controls and scan actions on the row below.
 */
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
      scanPlanSuggestionCount,
      batchMode,
      resolvedBatchProfile,
      deepUnlocked,
      deepLockedReason,
      applyingBatch,
      canApplyStrongMatches,
      mapHref,
      onBatchModeChange,
      onScan,
      onApplyStrongMatches,
      onReviewPass,
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
      <div className={cn(highlightSearchShellClass, appToolbarSurfaceShellClassName)}>
        <SearchBar
          ref={searchRef}
          glass
          value={search}
          onChange={onSearchChange}
          placeholder="Search Orbit by author, text, or notes…"
          inputClassName="h-9"
        />
      </div>
    );
    const reviewLabel =
      scanPlanSuggestionCount === 1
        ? "Review 1"
        : `Review ${scanPlanSuggestionCount.toLocaleString()}`;
    const showTriageProgress = passTotal > 0 && triagedCount > 0;

    return (
      <div
        className={cn(
          "orbit-toolbar relative min-w-0",
          compact ? "" : cn("space-y-1.5 py-1.5", appContentGutterClassName)
        )}
        aria-busy={scanning}
      >
        {scanning ? <ScrollingProgressBar className="absolute inset-x-0 top-0" /> : null}

        <div
          className={
            compact
              ? cn(
                  "flex flex-col gap-1.5 py-0.5 md:flex-row md:items-center md:gap-2 border-b border-hairline-strong",
                  appFeedHeaderFrostedClassName,
                  appContentGutterClassName
                )
              : "contents"
          }
        >
          <div
            className={cn(
              "flex items-center gap-1.5",
              compact && "md:hidden"
            )}
          >
            {mobileSidebar ? <div className="shrink-0 md:hidden">{mobileSidebar}</div> : null}

            {!compact ? <OrbitPageIdentity queueTotal={total} /> : null}

            {!compact ? <div className="min-w-0 flex-1">{searchField}</div> : null}

            {user ? (
              <div
                className={cn(
                  "hidden shrink-0 sm:block",
                  compact && "md:hidden"
                )}
              >
                <UserNavDynamic user={user} avatarSize={compact ? "lg" : "xl"} />
              </div>
            ) : null}
          </div>

        {canSelect ? (
          <div
            className={cn(
              "flex min-w-0 items-center gap-1.5",
              !compact && "mt-0"
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {hasScanPlan ? (
                <>
                  <Button
                    type="button"
                    variant="highlight"
                    size="sm"
                    className={cn(
                      "gap-1.5 px-2.5 text-xs",
                      compact ? "h-7" : "h-8"
                    )}
                    disabled={scanning || applyingBatch}
                    onClick={onReviewPass}
                  >
                    {applyingBatch ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ListChecks className="size-3.5" />
                    )}
                    <span className="hidden sm:inline">{reviewLabel}</span>
                    <span className="sm:hidden">{scanPlanSuggestionCount}</span>
                  </Button>

                  <ToolbarIconButton
                    label="Apply strong matches"
                    icon={BadgeCheck}
                    disabled={scanning || applyingBatch || !canApplyStrongMatches}
                    onClick={onApplyStrongMatches}
                    className="border-emerald-400/25 bg-emerald-400/10 text-emerald-700 hover:border-emerald-400/45 hover:bg-emerald-400/15 dark:text-emerald-100"
                  />

                  <ToolbarIconButton
                    label={scanButtonLabel}
                    icon={RefreshCw}
                    disabled={scanBusy || scanTargetCount === 0}
                    onClick={onScan}
                  />
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="highlight"
                    size="sm"
                    className={cn(
                      "gap-1.5 px-2.5 text-xs",
                      compact ? "h-7" : "h-8",
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

              <Link
                href={mapHref}
                aria-label="Open graph"
                title="Open graph"
                className={cn(
                  buttonVariants({ variant: "outline", size: compact ? "icon" : "icon-lg" }),
                  appToolbarSurfaceClassName,
                  compact && "size-8"
                )}
              >
                <MapIcon className="size-4 text-primary" aria-hidden />
              </Link>

              <ToolbarIconButton
                active={selectionMode}
                pressed={selectionMode}
                label={
                  selectionMode ? "Exit selection mode" : "Enter selection mode"
                }
                icon={CheckSquare}
                onClick={onToggleSelectionMode}
                className={cn(appToolbarSurfaceClassName, compact && "size-8")}
              />

              <KeyboardShortcutsHelpButton
                open={keyboardShortcutsOpen}
                onOpenChange={onKeyboardShortcutsOpenChange}
                groups={shortcutGroups}
                description="Orbit queue navigation and review actions."
                className={cn(
                  "shrink-0 border-hairline-strong text-muted-foreground hover:border-primary/30 hover:bg-accent-soft hover:text-foreground",
                  compact ? "size-8" : "size-9",
                  appToolbarSurfaceClassName
                )}
              />

              <PageHeaderCompactToggle
                className={cn(appToolbarSurfaceClassName, compact ? "size-8" : "size-9")}
              />

              {user ? (
                <div className={cn("shrink-0", compact ? "hidden md:block" : "sm:hidden")}>
                  <UserNavDynamic user={user} avatarSize={compact ? "lg" : "xl"} />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        </div>

        {compact ? (
          <CompactFloatingSearchBubble>{searchField}</CompactFloatingSearchBubble>
        ) : null}

        {canSelect && !compact ? (
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
        ) : null}

        {scanError ? (
          <div
            className={cn(
              "mt-2 rounded-sm border border-hairline-soft p-3",
              compact && "mx-4 sm:mx-5",
              appToolbarSurfaceClassName
            )}
          >
            {scanError}
          </div>
        ) : null}
      </div>
    );
  }
);
