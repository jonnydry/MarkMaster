"use client";

import type { ElementType } from "react";
import { AlignJustify, Grid3x3, LayoutList } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  appToolbarControlCompactHeightClassName,
  appToolbarControlExpandedHeightClassName,
  appToolbarSurfaceGroupClassName,
} from "@/lib/app-chrome";
import { highlightActiveClass, highlightIdleClass } from "@/lib/highlight-chrome";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/types";

const VIEW_MODES: { value: ViewMode; label: string; icon: React.ElementType }[] = [
  { value: "grid", label: "Grid", icon: Grid3x3 },
  { value: "feed", label: "Feed", icon: LayoutList },
  { value: "compact", label: "Compact", icon: AlignJustify },
];

type ViewModeControlsProps = {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  className?: string;
  compact?: boolean;
  gridLabel?: string;
  gridIcon?: ElementType;
};

/** Feed / compact / grid toggle — shared by dashboard and collection detail. */
export function ViewModeControls({
  viewMode,
  onViewModeChange,
  className,
  compact = false,
  gridLabel,
  gridIcon,
}: ViewModeControlsProps) {
  const viewModes = VIEW_MODES.map((mode) =>
    mode.value === "grid"
      ? {
          ...mode,
          label: gridLabel ?? mode.label,
          icon: gridIcon ?? mode.icon,
        }
      : mode
  );

  return (
    <div
      className={cn(
        "dashboard-view-mode flex items-center gap-0.5 rounded-sm p-0.5",
        appToolbarSurfaceGroupClassName,
        compact
          ? cn(appToolbarControlCompactHeightClassName, "shrink-0")
          : cn(appToolbarControlExpandedHeightClassName, "flex-1 sm:flex-none"),
        className
      )}
    >
      {viewModes.map(({ value, label, icon: Icon }) => {
        const selected = viewMode === value;
        return (
          <Button
            key={value}
            variant="ghost"
            size="sm"
            aria-pressed={selected}
            className={cn(
              "dashboard-view-button rounded-sm border border-transparent text-sm",
              compact ? "size-7 px-0" : "h-8 px-2.5",
              selected
                ? cn(highlightActiveClass, "border")
                : cn(highlightIdleClass, "hover:border-hairline-soft")
            )}
            title={`${label} view`}
            onClick={() => onViewModeChange(value)}
          >
            <Icon className="size-4 dashboard-view-icon" />
            {!compact ? (
              <span className="dashboard-view-label hidden lg:inline">{label}</span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
