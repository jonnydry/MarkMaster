"use client";

import type { ElementType } from "react";
import { ArrowDownUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ViewModeControls } from "@/components/view-mode-controls";
import type { SortField, ViewMode } from "@/types";
import {
  appToolbarControlCompactHeightClassName,
  appToolbarControlExpandedHeightClassName,
  appToolbarSurfaceClassName,
} from "@/lib/app-chrome";
import { cn } from "@/lib/utils";

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "bookmarkedAt", label: "Newest saved" },
  { value: "tweetCreatedAt", label: "Date posted" },
  { value: "likes", label: "Most liked" },
  { value: "retweets", label: "Most reposted" },
  { value: "replies", label: "Most replies" },
  { value: "performance", label: "Performance" },
  { value: "authorUsername", label: "Author" },
];

function sortLabel(field: SortField): string {
  return SORT_OPTIONS.find((option) => option.value === field)?.label ?? "Sort";
}

interface SortControlsProps {
  sortField: SortField;
  viewMode: ViewMode;
  onSortFieldChange: (field: SortField) => void;
  onViewModeChange: (mode: ViewMode) => void;
  className?: string;
  compact?: boolean;
  gridLabel?: string;
  gridIcon?: ElementType;
}

export function SortControls({
  sortField,
  viewMode,
  onSortFieldChange,
  onViewModeChange,
  className,
  compact = false,
  gridLabel,
  gridIcon,
}: SortControlsProps) {
  return (
    <div
      className={cn(
        "dashboard-sort-controls flex items-center gap-1.5",
        compact ? "w-auto shrink-0" : "w-full sm:w-auto",
        className
      )}
    >
      <Select
        value={sortField}
        onValueChange={(v: string | null) => v && onSortFieldChange(v as SortField)}
      >
        <SelectTrigger
          aria-label={`Sort bookmarks: ${sortLabel(sortField)}`}
          size="default"
          className={cn(
            "dashboard-sort-trigger gap-1.5 rounded-sm border-transparent font-semibold hover:bg-hover",
            appToolbarSurfaceClassName,
            compact
              ? cn(
                  appToolbarControlCompactHeightClassName,
                  "w-8 shrink-0 justify-center p-0 sm:w-auto sm:justify-start sm:px-2.5"
                )
              : cn(appToolbarControlExpandedHeightClassName, "min-w-[100px] flex-1 sm:flex-none")
          )}
        >
          <ArrowDownUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className={cn("whitespace-nowrap", compact && "hidden sm:inline")}>
            {sortLabel(sortField)}
          </span>
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ViewModeControls
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        compact={compact}
        gridLabel={gridLabel}
        gridIcon={gridIcon}
      />
    </div>
  );
}
