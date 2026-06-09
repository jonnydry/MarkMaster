"use client";

import { ArrowDownUp, LayoutList, AlignJustify, Grid3x3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { SortField, ViewMode } from "@/types";
import {
  appToolbarSurfaceClassName,
  appToolbarSurfaceGroupClassName,
} from "@/lib/app-chrome";
import { highlightActiveClass, highlightIdleClass } from "@/lib/highlight-chrome";
import { cn } from "@/lib/utils";

const VIEW_MODES: { value: ViewMode; label: string; icon: React.ElementType }[] = [
  { value: "feed", label: "Feed", icon: LayoutList },
  { value: "compact", label: "Compact", icon: AlignJustify },
  { value: "grid", label: "Grid", icon: Grid3x3 },
];

interface SortControlsProps {
  sortField: SortField;
  viewMode: ViewMode;
  onSortFieldChange: (field: SortField) => void;
  onViewModeChange: (mode: ViewMode) => void;
  className?: string;
  compact?: boolean;
}

export function SortControls({
  sortField,
  viewMode,
  onSortFieldChange,
  onViewModeChange,
  className,
  compact = false,
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
          size="default"
          className={cn(
            "dashboard-sort-trigger gap-1.5 rounded-sm border-hairline-strong font-semibold hover:border-primary/30",
            appToolbarSurfaceClassName,
            compact
              ? "h-9 w-9 shrink-0 justify-center p-0 sm:min-w-[7.5rem] sm:justify-start sm:px-3"
              : "h-9 min-w-[100px] flex-1 sm:flex-none"
          )}
        >
          <ArrowDownUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className={cn(compact && "hidden sm:inline")}>Sort</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tweetCreatedAt">Date Tweeted</SelectItem>
          <SelectItem value="bookmarkedAt">Newest Saved</SelectItem>
          <SelectItem value="likes">Most Liked</SelectItem>
          <SelectItem value="retweets">Most Retweeted</SelectItem>
          <SelectItem value="replies">Most Replied</SelectItem>
          <SelectItem value="performance">Performance</SelectItem>
          <SelectItem value="authorUsername">Author</SelectItem>
        </SelectContent>
      </Select>
      <div
        className={cn(
          "dashboard-view-mode flex items-center gap-0.5 rounded-sm border p-0.5",
          appToolbarSurfaceGroupClassName,
          compact ? "shrink-0" : "flex-1 sm:flex-none"
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
                  : cn(
                      highlightIdleClass,
                      "hover:border-hairline-soft"
                    )
              )}
              title={`${label} view`}
              onClick={() => onViewModeChange(value)}
            >
              <Icon className={cn("size-4 dashboard-view-icon", !compact && "sm:mr-0")} />
              {!compact ? (
                <span className="dashboard-view-label hidden lg:inline">{label}</span>
              ) : null}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
