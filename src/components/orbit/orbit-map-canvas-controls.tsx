"use client";

import { Clock, Filter, Layers, Minus, Plus, RotateCcw } from "lucide-react";
import {
  orbitMapControlButtonClass,
  orbitMapZoomButtonClass,
  orbitMapZoomDividerClass,
  orbitMapZoomShellClass,
} from "@/lib/orbit-map-chrome";
import { cn } from "@/lib/utils";
import type { GraphFilter } from "@/lib/orbit-worker-protocol";

const FILTERS = [
  { key: "all" as const, label: "All", icon: Layers },
  { key: "loose" as const, label: "Loose", icon: Filter },
  { key: "recent" as const, label: "Recent", icon: Clock },
];

export interface OrbitMapCanvasControlsProps {
  activeFilter: GraphFilter;
  onFilterChange: (filter: GraphFilter) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  filterControlsClassName?: string;
  zoomControlsClassName?: string;
  hideLooseFilter?: boolean;
}

export function OrbitMapCanvasControls({
  activeFilter,
  onFilterChange,
  onZoomIn,
  onZoomOut,
  onResetView,
  filterControlsClassName,
  zoomControlsClassName,
  hideLooseFilter = false,
}: OrbitMapCanvasControlsProps) {
  const filters = hideLooseFilter
    ? FILTERS.filter((item) => item.key !== "loose")
    : FILTERS;

  return (
    <>
      <div
        className={cn(
          "pointer-events-none absolute left-3 top-3 z-20 flex shrink-0 flex-nowrap items-center gap-1 sm:left-4 sm:top-4",
          filterControlsClassName
        )}
        onMouseDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {filters.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onFilterChange(key)}
            className={orbitMapControlButtonClass(activeFilter === key)}
            aria-pressed={activeFilter === key}
            aria-label={label}
            title={label}
          >
            <Icon className="size-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <div
        className={cn(
          "pointer-events-none absolute flex flex-col gap-1.5",
          zoomControlsClassName ?? "bottom-4 right-4"
        )}
        onMouseDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className={orbitMapZoomShellClass()}>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={onZoomIn}
            className={orbitMapZoomButtonClass()}
          >
            <Plus className="size-4" />
          </button>
          <span className={orbitMapZoomDividerClass()} />
          <button
            type="button"
            aria-label="Zoom out"
            onClick={onZoomOut}
            className={orbitMapZoomButtonClass()}
          >
            <Minus className="size-4" />
          </button>
          <span className={orbitMapZoomDividerClass()} />
          <button
            type="button"
            aria-label="Reset view"
            onClick={onResetView}
            className={orbitMapZoomButtonClass()}
          >
            <RotateCcw className="size-4" />
          </button>
        </div>
      </div>
    </>
  );
}
