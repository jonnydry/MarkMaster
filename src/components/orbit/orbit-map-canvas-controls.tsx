"use client";

import { Minus, Plus, Scan } from "lucide-react";
import {
  orbitMapZoomButtonClass,
  orbitMapZoomDividerClass,
  orbitMapZoomShellClass,
} from "@/lib/orbit-map-chrome";
import { cn } from "@/lib/utils";

export interface OrbitMapCanvasControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  zoomControlsClassName?: string;
}

/** Zoom in / out / fit, stacked in the bottom-right corner of the map. */
export function OrbitMapCanvasControls({
  onZoomIn,
  onZoomOut,
  onFitView,
  zoomControlsClassName,
}: OrbitMapCanvasControlsProps) {
  return (
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
          title="Zoom in"
          onClick={onZoomIn}
          className={orbitMapZoomButtonClass()}
        >
          <Plus className="size-4" />
        </button>
        <span className={orbitMapZoomDividerClass()} />
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={onZoomOut}
          className={orbitMapZoomButtonClass()}
        >
          <Minus className="size-4" />
        </button>
        <span className={orbitMapZoomDividerClass()} />
        <button
          type="button"
          aria-label="Fit the whole map"
          title="Fit the whole map"
          onClick={onFitView}
          className={orbitMapZoomButtonClass()}
        >
          <Scan className="size-4" />
        </button>
      </div>
    </div>
  );
}
