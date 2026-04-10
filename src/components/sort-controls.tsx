"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SortField, ViewMode } from "@/types";

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
    <div className="flex items-center gap-2">
      <Select
        value={sortField}
        onValueChange={(v: string | null) => v && onSortFieldChange(v as SortField)}
      >
        <SelectTrigger className="w-[120px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="bookmarkedAt">Newest</SelectItem>
          <SelectItem value="tweetCreatedAt">Date Tweeted</SelectItem>
          <SelectItem value="likes">Most Liked</SelectItem>
          <SelectItem value="retweets">Most Retweeted</SelectItem>
          <SelectItem value="replies">Most Replied</SelectItem>
          <SelectItem value="authorUsername">Author</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-secondary">
        {(["feed", "compact", "grid"] as ViewMode[]).map((mode) => (
          <Button
            key={mode}
            variant={viewMode === mode ? "default" : "ghost"}
            size="sm"
            className={`h-7 px-2.5 text-xs ${
              viewMode === mode
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} view`}
            onClick={() => onViewModeChange(mode)}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </Button>
        ))}
      </div>
    </div>
  );
}
