"use client";

import {
  ArrowDownAZ,
  ArrowUpAZ,
  LayoutGrid,
  LayoutList,
  List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SortField, SortDirection, ViewMode } from "@/types";

interface SortControlsProps {
  sortField: SortField;
  sortDirection: SortDirection;
  viewMode: ViewMode;
  onSortFieldChange: (field: SortField) => void;
  onSortDirectionChange: (direction: SortDirection) => void;
  onViewModeChange: (mode: ViewMode) => void;
  total: number;
}

export function SortControls({
  sortField,
  sortDirection,
  viewMode,
  onSortFieldChange,
  onSortDirectionChange,
  onViewModeChange,
  total,
}: SortControlsProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border">
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-[#3f3f46]">
          {total.toLocaleString()} bookmark{total !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Select
          value={sortField}
          onValueChange={(v) => onSortFieldChange(v as SortField)}
        >
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bookmarkedAt">Date Bookmarked</SelectItem>
            <SelectItem value="tweetCreatedAt">Date Tweeted</SelectItem>
            <SelectItem value="likes">Most Liked</SelectItem>
            <SelectItem value="retweets">Most Retweeted</SelectItem>
            <SelectItem value="replies">Most Replied</SelectItem>
            <SelectItem value="authorUsername">Author</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={sortDirection === "desc" ? "Descending" : "Ascending"}
          onClick={() =>
            onSortDirectionChange(
              sortDirection === "desc" ? "asc" : "desc"
            )
          }
        >
          {sortDirection === "desc" ? (
            <ArrowDownAZ className="w-4 h-4" />
          ) : (
            <ArrowUpAZ className="w-4 h-4" />
          )}
        </Button>
        <div className="h-4 w-px bg-border mx-1" />
        <div className="flex items-center">
          {(["feed", "compact", "grid"] as ViewMode[]).map((mode) => (
            <Button
              key={mode}
              variant={viewMode === mode ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} view`}
              onClick={() => onViewModeChange(mode)}
            >
              {mode === "feed" ? (
                <LayoutList className="w-4 h-4" />
              ) : mode === "compact" ? (
                <List className="w-4 h-4" />
              ) : (
                <LayoutGrid className="w-4 h-4" />
              )}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
