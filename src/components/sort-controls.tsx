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
}

export function SortControls({
  sortField,
  viewMode,
  onSortFieldChange,
  onViewModeChange,
  className,
}: SortControlsProps) {
  return (
    <div className={cn("dashboard-sort-controls flex w-full items-center gap-2 sm:w-auto", className)}>
      <Select
        value={sortField}
        onValueChange={(v: string | null) => v && onSortFieldChange(v as SortField)}
      >
        <SelectTrigger
          size="lg"
          className="dashboard-sort-trigger min-w-[100px] flex-1 gap-1.5 rounded-xl border-hairline-strong bg-surface-1 shadow-sm sm:flex-none"
        >
          <ArrowDownUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>Sort</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tweetCreatedAt">Date Tweeted</SelectItem>
          <SelectItem value="bookmarkedAt">Newest Saved</SelectItem>
          <SelectItem value="likes">Most Liked</SelectItem>
          <SelectItem value="retweets">Most Retweeted</SelectItem>
          <SelectItem value="replies">Most Replied</SelectItem>
          <SelectItem value="authorUsername">Author</SelectItem>
        </SelectContent>
      </Select>
      <div className="dashboard-view-mode flex flex-1 items-center gap-0.5 rounded-xl border border-hairline-soft bg-surface-2 p-1 shadow-sm sm:flex-none">
        {VIEW_MODES.map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            variant={viewMode === value ? "default" : "ghost"}
            size="sm"
            className={`dashboard-view-button h-10 px-2.5 text-sm ${
              viewMode === value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={`${label} view`}
            onClick={() => onViewModeChange(value)}
          >
            <Icon className="size-4 dashboard-view-icon" />
            <span className="dashboard-view-label">{label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
