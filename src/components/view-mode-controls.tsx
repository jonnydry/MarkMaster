"use client";

import { AlignJustify, Grid3x3, LayoutList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appToolbarSurfaceGroupClassName } from "@/lib/app-chrome";
import { highlightActiveClass, highlightIdleClass } from "@/lib/highlight-chrome";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/types";

const VIEW_MODES: { value: ViewMode; label: string; icon: React.ElementType }[] = [
  { value: "feed", label: "Feed", icon: LayoutList },
  { value: "compact", label: "Compact", icon: AlignJustify },
  { value: "grid", label: "Grid", icon: Grid3x3 },
];

type ViewModeControlsProps = {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  className?: string;
  compact?: boolean;
};

/** Feed / compact / grid toggle — shared by dashboard and collection detail. */
export function ViewModeControls({
  viewMode,
  onViewModeChange,
  className,
  compact = false,
}: ViewModeControlsProps) {
  return (
    <div
      className={cn(
        "dashboard-view-mode flex items-center gap-0.5 rounded-sm p-0.5",
        appToolbarSurfaceGroupClassName,
        compact ? "shrink-0" : "flex-1 sm:flex-none",
        className
      )}
    >
      {VIEW_MODES.map(({ value, label, icon: Icon }) => {
        const selected = viewMode === value;
        return (
          <Button
            key={value}
            variant="ghost"
            size="sm"
            aria-pressed={selected}
            className={cn(
              "dashboard-view-button h-8 rounded-sm border border-transparent text-sm",
              compact ? "size-8 px-0" : "px-2.5",
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
