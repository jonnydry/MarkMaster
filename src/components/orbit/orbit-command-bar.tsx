"use client";

import { forwardRef, type ReactNode } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  ListChecks,
  Loader2,
  Map as MapIcon,
  RefreshCw,
  SquareCheckBig,
} from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/search-bar";
import { ScrollingProgressBar } from "@/components/ui/scrolling-progress-bar";
import { KeyboardShortcutsHelpButton } from "@/components/keyboard-shortcuts-help-button";
import { OrbitBatchMenu } from "@/components/orbit/orbit-batch-menu";
import { useOrbitalTheme } from "@/components/providers";
import {
  orbitControlRadius,
  orbitDataClass,
  orbitHairlineBorder,
  orbitMetaMuted,
  orbitMetaSoft,
} from "@/lib/orbit-route-chrome";
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
import { cn } from "@/lib/utils";

export interface OrbitCommandBarProps {
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

function SegmentedControl({
  isOrbital,
  children,
}: {
  isOrbital: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-sm border p-0.5",
        orbitHairlineBorder(isOrbital),
        isOrbital ? "bg-background/35" : "bg-background/45 dark:bg-white/[0.035]"
      )}
    >
      {children}
    </div>
  );
}

function Segment({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent-soft hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/**
 * The Orbit command bar — one control surface that replaces the old stacked
 * header-meta strip, scan hero, queue toolbar, and search box. The unsorted
 * count and queue ordering live here and nowhere else.
 */
export const OrbitCommandBar = forwardRef<HTMLInputElement, OrbitCommandBarProps>(
  function OrbitCommandBar(
    {
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
    const { isOrbital } = useOrbitalTheme();
    const scanBusy = queueIsLoading || scanning;
    const recentCount = Math.min(total, ORBIT_RECENT_PAGE_SIZE);
    const reviewLabel =
      scanPlanSuggestionCount === 1
        ? "Review 1 suggestion"
        : `Review ${scanPlanSuggestionCount.toLocaleString()} suggestions`;
    const showTriageProgress = passTotal > 0 && triagedCount > 0;

    return (
      <section
        aria-busy={scanning}
        className={cn(
          "relative overflow-hidden rounded-sm border",
          orbitHairlineBorder(isOrbital),
          isOrbital
            ? "glass-orbital"
            : "bg-surface-1/70 shadow-[0_18px_44px_-38px_rgba(15,23,42,0.75)] dark:bg-white/[0.035]"
        )}
      >
        {scanning ? <ScrollingProgressBar /> : null}

        <div className="flex flex-col gap-2.5 px-3 py-2.5 sm:px-3.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* Scope zone */}
            {canSelect ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <SegmentedControl isOrbital={isOrbital}>
                  <Segment
                    active={orbitView === "recent"}
                    onClick={() => onChangeView("recent")}
                  >
                    Recent
                    <span className="rounded-sm bg-black/5 px-1 py-0.5 text-[10px] tabular-nums dark:bg-white/10">
                      {recentCount.toLocaleString()}
                    </span>
                  </Segment>
                  <Segment
                    active={orbitView === "all"}
                    onClick={() => onChangeView("all")}
                  >
                    All
                    <span className="rounded-sm bg-black/5 px-1 py-0.5 text-[10px] tabular-nums dark:bg-white/10">
                      {total.toLocaleString()}
                    </span>
                  </Segment>
                </SegmentedControl>

                <SegmentedControl isOrbital={isOrbital}>
                  <Segment
                    active={sortDirection === "desc"}
                    onClick={() => onChangeSortDirection("desc")}
                  >
                    Newest
                  </Segment>
                  <Segment
                    active={sortDirection === "asc"}
                    onClick={() => onChangeSortDirection("asc")}
                  >
                    Oldest
                  </Segment>
                </SegmentedControl>
              </div>
            ) : null}

            {/* Action zone */}
            <div className="ml-auto flex min-w-0 flex-wrap items-center gap-1.5">
              {hasScanPlan ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    className={cn(
                      "h-8 gap-1.5 px-3 text-xs",
                      orbitControlRadius(isOrbital),
                      "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                    disabled={scanning || applyingBatch}
                    onClick={onReviewPass}
                  >
                    {applyingBatch ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ListChecks className="size-3.5" />
                    )}
                    {reviewLabel}
                  </Button>

                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className={cn(
                      "size-8 shrink-0 border-emerald-400/25 bg-emerald-400/10 text-emerald-700 hover:border-emerald-400/45 hover:bg-emerald-400/15 hover:text-foreground dark:text-emerald-100",
                      orbitControlRadius(isOrbital)
                    )}
                    disabled={scanning || applyingBatch || !canApplyStrongMatches}
                    onClick={onApplyStrongMatches}
                    aria-label="Apply strong matches"
                    title="Apply strong matches"
                  >
                    {applyingBatch ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <BadgeCheck className="size-3.5" />
                    )}
                  </Button>

                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className={cn(
                      "size-8 shrink-0 border-hairline-soft bg-surface-2/70 text-foreground hover:border-primary/30 hover:bg-accent-soft",
                      orbitControlRadius(isOrbital)
                    )}
                    disabled={scanBusy || scanTargetCount === 0}
                    onClick={onScan}
                    aria-label={scanButtonLabel}
                    title={scanButtonLabel}
                  >
                    {scanBusy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                  </Button>
                </>
              ) : (
                <div className="flex items-stretch">
                  <Button
                    size="sm"
                    className={cn(
                      "h-8 gap-1.5 rounded-r-none px-3 text-xs",
                      orbitControlRadius(isOrbital),
                      isOrbital
                        ? "border-primary/40 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                        : "border-foreground/80 bg-foreground text-background shadow-[0_14px_30px_-22px_rgba(59,130,246,0.75)] hover:bg-foreground/90"
                    )}
                    disabled={scanBusy || scanTargetCount === 0}
                    onClick={onScan}
                  >
                    {scanBusy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <GrokMark className="size-3.5" title="Grok" />
                    )}
                    {scanButtonLabel}
                  </Button>
                  <OrbitBatchMenu
                    attached
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
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-sm border border-hairline-soft bg-surface-2/70 text-foreground transition-colors hover:border-primary/30 hover:bg-accent-soft",
                  orbitControlRadius(isOrbital)
                )}
                aria-label="Open graph"
                title="Open graph"
              >
                <MapIcon className="size-3.5 text-primary" aria-hidden />
              </Link>
            </div>
          </div>

          {/* Utility row: search + select + help */}
          {canSelect || search.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <div
              className={cn(
                "relative min-w-0 flex-1 overflow-hidden rounded-sm border",
                orbitHairlineBorder(isOrbital),
                isOrbital ? "bg-background/35" : "bg-background/45 dark:bg-white/[0.035]"
              )}
            >
              <SearchBar
                ref={searchRef}
                glass
                value={search}
                onChange={onSearchChange}
                placeholder="Search Orbit by author, text, or notes…"
                inputClassName="h-9 rounded-sm"
              />
            </div>

            {canSelect ? (
              <button
                type="button"
                aria-pressed={selectionMode}
                title={
                  selectionMode
                    ? "Exit bulk selection"
                    : "Select bookmarks for bulk Grok scan"
                }
                onClick={onToggleSelectionMode}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-sm border px-3 text-xs font-medium transition-colors",
                  orbitHairlineBorder(isOrbital),
                  selectionMode
                    ? "border-primary/30 bg-primary/15 text-primary"
                    : "bg-surface-2/70 text-muted-foreground hover:bg-accent-soft hover:text-foreground"
                )}
              >
                <SquareCheckBig className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">
                  {selectionMode ? "Done" : "Select"}
                </span>
              </button>
            ) : null}

            <KeyboardShortcutsHelpButton
              open={keyboardShortcutsOpen}
              onOpenChange={onKeyboardShortcutsOpenChange}
              groups={shortcutGroups}
              description="Orbit queue navigation and review actions."
              className={cn(
                "size-9 shrink-0 border-primary/20 bg-surface-2/70 text-primary/80 hover:border-primary/35 hover:bg-primary/10 hover:text-primary",
                isOrbital && "shadow-[0_0_18px_rgba(37,99,235,0.08)]"
              )}
            />
          </div>
          ) : null}

          {/* Meta line: single authoritative count + triage progress + updating */}
          {canSelect || search.length > 0 ? (
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]",
              orbitMetaMuted(isOrbital)
            )}
          >
            <span className={cn(orbitDataClass(isOrbital), "normal-case")}>
              {visibleStatusLabel}
            </span>
            {showTriageProgress ? (
              <span
                className={cn(orbitDataClass(isOrbital), "normal-case", orbitMetaSoft(isOrbital))}
              >
                {triagedCount} / {passTotal} triaged
              </span>
            ) : null}
            {isUpdating ? (
              <span className="flex shrink-0 items-center gap-1">
                <Loader2 className="size-3 animate-spin" /> Updating…
              </span>
            ) : null}
          </div>
          ) : null}
        </div>

        {scanError ? (
          <div
            className={cn(
              "border-t p-3",
              orbitHairlineBorder(isOrbital),
              isOrbital ? "bg-background/30" : "bg-background/45"
            )}
          >
            {scanError}
          </div>
        ) : null}
      </section>
    );
  }
);
