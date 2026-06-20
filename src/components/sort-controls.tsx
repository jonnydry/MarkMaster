"use client";

import { ArrowDownUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ViewModeControls } from "@/components/view-mode-controls";
import type { SortField, ViewMode } from "@/types";
import { appToolbarSurfaceClassName } from "@/lib/app-chrome";
import { cn } from "@/lib/utils";

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
              ? "h-8 w-8 shrink-0 justify-center p-0 sm:min-w-[7.5rem] sm:justify-start sm:px-3"
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
      <ViewModeControls
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        compact={compact}
      />
    </div>
  );
}
