"use client";

import { SquareCheckBig } from "lucide-react";

import { useOrbitalTheme } from "@/components/providers";
import { ORBIT_RECENT_PAGE_SIZE } from "@/lib/orbit-navigation";
import {
  orbitDataClass,
  orbitHairlineBorder,
  orbitMetaSoft,
} from "@/lib/orbit-route-chrome";
import type { OrbitSortDirection, OrbitView } from "@/lib/orbit-navigation";
import { cn } from "@/lib/utils";

export interface OrbitQueueToolbarProps {
  orbitView: OrbitView;
  total: number;
  sortDirection: OrbitSortDirection;
  queueOrderLabel: string;
  onChangeView: (view: OrbitView) => void;
  onChangeSortDirection: (direction: OrbitSortDirection) => void;
  selectionMode: boolean;
  canSelect: boolean;
  onToggleSelectionMode: () => void;
}

export function OrbitQueueToolbar({
  orbitView,
  total,
  sortDirection,
  queueOrderLabel,
  onChangeView,
  onChangeSortDirection,
  selectionMode,
  canSelect,
  onToggleSelectionMode,
}: OrbitQueueToolbarProps) {
  const { isOrbital } = useOrbitalTheme();
  const controlShell = isOrbital
    ? "inline-flex items-center gap-1 rounded-sm border border-hairline-soft bg-background/35 p-1"
    : "inline-flex items-center gap-1 rounded-sm border border-hairline-soft bg-background/45 p-1 dark:border-white/10 dark:bg-white/[0.035]";
  const inactiveSegmentClass = isOrbital
    ? "text-muted-foreground hover:bg-accent-soft hover:text-foreground"
    : "text-muted-foreground hover:bg-accent-soft hover:text-foreground dark:text-white/60 dark:hover:bg-white/[0.06] dark:hover:text-white";
  const countClass = (active: boolean) =>
    active
      ? "bg-primary-foreground/15 text-primary-foreground"
      : isOrbital
        ? "bg-primary/10 text-primary/70"
        : "bg-muted/70 text-muted-foreground dark:bg-white/10 dark:text-white/70";

  if (!canSelect) return null;

  return (
    <div className="flex w-full flex-col gap-2">
      <p
        className={cn(
          orbitDataClass(isOrbital),
          "min-w-0 normal-case text-[11px]",
          orbitMetaSoft(isOrbital)
        )}
      >
        {total.toLocaleString()} in queue · {queueOrderLabel}
      </p>
      <div className="flex w-full flex-wrap items-center gap-2">
        <div className={controlShell}>
          <button
            type="button"
            aria-pressed={orbitView === "recent"}
            onClick={() => onChangeView("recent")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors",
              orbitView === "recent"
                ? "bg-primary text-primary-foreground"
                : inactiveSegmentClass
            )}
          >
            Recent
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 text-[10px] tabular-nums",
                countClass(orbitView === "recent")
              )}
            >
              {Math.min(total, ORBIT_RECENT_PAGE_SIZE).toLocaleString()}
            </span>
          </button>
          <button
            type="button"
            aria-pressed={orbitView === "all"}
            onClick={() => onChangeView("all")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors",
              orbitView === "all"
                ? "bg-primary text-primary-foreground"
                : inactiveSegmentClass
            )}
          >
            All
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 text-[10px] tabular-nums",
                countClass(orbitView === "all")
              )}
            >
              {total.toLocaleString()}
            </span>
          </button>
        </div>

        <div className={controlShell}>
          <button
            type="button"
            aria-pressed={sortDirection === "desc"}
            onClick={() => onChangeSortDirection("desc")}
            className={cn(
              "inline-flex h-8 items-center rounded-sm px-2.5 text-xs font-medium transition-colors",
              sortDirection === "desc"
                ? "bg-primary text-primary-foreground"
                : inactiveSegmentClass
            )}
          >
            Newest
          </button>
          <button
            type="button"
            aria-pressed={sortDirection === "asc"}
            onClick={() => onChangeSortDirection("asc")}
            className={cn(
              "inline-flex h-8 items-center rounded-sm px-2.5 text-xs font-medium transition-colors",
              sortDirection === "asc"
                ? "bg-primary text-primary-foreground"
                : inactiveSegmentClass
            )}
          >
            Oldest
          </button>
        </div>

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
            "inline-flex h-8 items-center gap-1.5 rounded-sm border px-3 text-xs font-medium transition-colors",
            orbitHairlineBorder(isOrbital),
            selectionMode
              ? isOrbital
                ? "border-primary/30 bg-primary/15 text-primary"
                : "border-primary/30 bg-primary/15 text-primary"
              : isOrbital
                ? "bg-surface-2/70 text-muted-foreground hover:bg-accent-soft hover:text-foreground"
                : "bg-surface-2/70 text-muted-foreground hover:bg-accent-soft hover:text-foreground dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
          )}
        >
          <SquareCheckBig className="size-3.5" aria-hidden />
          {selectionMode ? "Done" : "Select"}
        </button>
      </div>
    </div>
  );
}
