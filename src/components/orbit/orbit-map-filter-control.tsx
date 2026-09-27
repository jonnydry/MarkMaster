"use client";

import { Clock, Filter, Layers } from "lucide-react";

import { highlightSegmentActiveClass } from "@/lib/highlight-chrome";
import { orbitHairlineBorder } from "@/lib/orbit-route-chrome";
import type { GraphFilter } from "@/lib/orbit-worker-protocol";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "all" as const, label: "All", icon: Layers },
  { key: "loose" as const, label: "Loose", icon: Filter },
  { key: "recent" as const, label: "Recent", icon: Clock },
];

interface OrbitMapFilterControlProps {
  activeFilter: GraphFilter;
  onFilterChange: (filter: GraphFilter) => void;
  /** Hide Loose when the graph is already the queue. */
  hideLooseFilter?: boolean;
  /** Icon-only buttons for tight bars. */
  compact?: boolean;
  className?: string;
}

/**
 * All / Loose / Recent segmented control. Lives in the map's top bar with the
 * Queue⇄Map switch so it matches that family instead of floating on the canvas.
 */
export function OrbitMapFilterControl({
  activeFilter,
  onFilterChange,
  hideLooseFilter = false,
  compact = false,
  className,
}: OrbitMapFilterControlProps) {
  const filters = hideLooseFilter
    ? FILTERS.filter((item) => item.key !== "loose")
    : FILTERS;

  return (
    <div
      role="group"
      aria-label="Show bookmarks"
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm border p-0.5",
        orbitHairlineBorder(),
        className
      )}
    >
      {filters.map(({ key, label, icon: Icon }) => {
        const active = activeFilter === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onFilterChange(key)}
            aria-pressed={active}
            title={label}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45",
              active
                ? highlightSegmentActiveClass
                : "text-muted-foreground hover:bg-hover hover:text-foreground"
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span className={cn(compact && "sr-only")}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
