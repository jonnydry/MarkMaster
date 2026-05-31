"use client";

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
    ? "inline-flex items-center gap-1 rounded-sm border border-hairline-soft bg-surface-2/70 p-1"
    : "inline-flex items-center gap-1 rounded-sm border border-hairline-soft bg-surface-2/70 p-1 dark:border-white/10 dark:bg-white/5";

  if (!canSelect) return null;

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <p
        className={cn(
          orbitDataClass(isOrbital),
          "min-w-0 flex-1 normal-case text-[11px]",
          orbitMetaSoft(isOrbital)
        )}
      >
        {total.toLocaleString()} in queue · {queueOrderLabel}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className={controlShell}>
          <button
            type="button"
            aria-pressed={orbitView === "recent"}
            onClick={() => onChangeView("recent")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors",
              orbitView === "recent"
                ? "bg-primary text-primary-foreground"
                : isOrbital
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground hover:text-foreground dark:text-white/60 dark:hover:text-white"
            )}
          >
            Recent
            <span className="rounded-sm bg-primary-foreground/15 px-1.5 py-0.5 text-[10px] tabular-nums">
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
                : isOrbital
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground hover:text-foreground dark:text-white/60 dark:hover:text-white"
            )}
          >
            All
            <span className="rounded-sm bg-primary-foreground/15 px-1.5 py-0.5 text-[10px] tabular-nums">
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
                : isOrbital
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground hover:text-foreground dark:text-white/60 dark:hover:text-white"
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
                : isOrbital
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground hover:text-foreground dark:text-white/60 dark:hover:text-white"
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
          {selectionMode ? "Done" : "Select"}
        </button>
      </div>
    </div>
  );
}
