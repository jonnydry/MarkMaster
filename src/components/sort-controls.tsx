"use client";

import { LayoutList, AlignJustify, Grid3x3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { SortField, ViewMode } from "@/types";

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
}

export function SortControls({
  sortField,
  viewMode,
  onSortFieldChange,
  onViewModeChange,
}: SortControlsProps) {
  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <Select
        value={sortField}
        onValueChange={(v: string | null) => v && onSortFieldChange(v as SortField)}
      >
        <SelectTrigger className="h-8 min-w-[92px] flex-1 gap-1.5 rounded-xl border-hairline-strong bg-surface-1 text-xs shadow-sm sm:flex-none">
          Sort
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
      <div className="flex flex-1 items-center gap-0.5 rounded-xl border border-hairline-soft bg-surface-2 p-0.5 shadow-sm sm:flex-none">
        {VIEW_MODES.map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            variant={viewMode === value ? "default" : "ghost"}
            size="sm"
            className={`h-8 px-2.5 text-xs ${
              viewMode === value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={`${label} view`}
            onClick={() => onViewModeChange(value)}
          >
            <Icon className="w-3.5 h-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
