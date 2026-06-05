"use client";

import { Clock, Filter, Layers, Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrbitalTheme } from "@/components/providers";
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
}

export function OrbitMapCanvasControls({
  activeFilter,
  onFilterChange,
  onZoomIn,
  onZoomOut,
  onResetView,
  filterControlsClassName,
  zoomControlsClassName,
}: OrbitMapCanvasControlsProps) {
  const { isOrbital } = useOrbitalTheme();

  return (
    <>
      <div
        className={cn(
          "pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-1",
          filterControlsClassName
        )}
        onMouseDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
      >
        {FILTERS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onFilterChange(key)}
            className={cn(
              "pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-transparent px-2.5 text-xs font-medium transition-colors backdrop-blur-xl",
              activeFilter === key
                ? isOrbital
                  ? "border-hairline-soft bg-surface-1/90 text-foreground"
                  : "border-white/[0.08] bg-white/[0.13] text-white"
                : isOrbital
                  ? "text-muted-foreground hover:bg-accent-soft/60 hover:text-foreground"
                  : "text-white/50 hover:bg-white/[0.06] hover:text-white"
            )}
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
      >
        <div
          className={cn(
            "pointer-events-auto inline-flex flex-col overflow-hidden rounded-full border shadow-none backdrop-blur-xl",
            isOrbital
              ? "border-hairline-soft bg-surface-1/80"
              : "border-white/[0.055] bg-white/[0.035]"
          )}
        >
          <button
            type="button"
            aria-label="Zoom in"
            onClick={onZoomIn}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              isOrbital
                ? "text-foreground/70 hover:bg-accent-soft hover:text-foreground"
                : "text-white/70 hover:bg-white/[0.08] hover:text-white"
            )}
          >
            <Plus className="size-4" />
          </button>
          <span
            className={cn(
              "h-px w-full",
              isOrbital ? "bg-hairline-soft" : "bg-white/[0.08]"
            )}
          />
          <button
            type="button"
            aria-label="Zoom out"
            onClick={onZoomOut}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              isOrbital
                ? "text-foreground/70 hover:bg-accent-soft hover:text-foreground"
                : "text-white/70 hover:bg-white/[0.08] hover:text-white"
            )}
          >
            <Minus className="size-4" />
          </button>
          <span
            className={cn(
              "h-px w-full",
              isOrbital ? "bg-hairline-soft" : "bg-white/[0.08]"
            )}
          />
          <button
            type="button"
            aria-label="Reset view"
            onClick={onResetView}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              isOrbital
                ? "text-foreground/70 hover:bg-accent-soft hover:text-foreground"
                : "text-white/70 hover:bg-white/[0.08] hover:text-white"
            )}
          >
            <RotateCcw className="size-4" />
          </button>
        </div>
      </div>
    </>
  );
}
