"use client";

import { Image, Video, Link, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MediaFilter, TagWithCount } from "@/types";

interface FilterPanelProps {
  mediaFilter: MediaFilter;
  onMediaFilterChange: (filter: MediaFilter) => void;
  authorFilter: string;
  onAuthorFilterChange: (author: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (date: string) => void;
  onDateToChange: (date: string) => void;
  selectedTags: string[];
  onTagToggle: (tagId: string) => void;
  tags: TagWithCount[];
  onClearAll: () => void;
  hasActiveFilters: boolean;
}

const MEDIA_OPTIONS: { value: MediaFilter; label: string; icon: React.ElementType }[] = [
  { value: "all", label: "All", icon: FileText },
  { value: "images", label: "Images", icon: Image },
  { value: "video", label: "Video", icon: Video },
  { value: "links", label: "Links", icon: Link },
  { value: "text-only", label: "Text", icon: FileText },
];

export function FilterPanel({
  mediaFilter,
  onMediaFilterChange,
  authorFilter,
  onAuthorFilterChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  selectedTags,
  onTagToggle,
  tags,
  onClearAll,
  hasActiveFilters,
}: FilterPanelProps) {
  return (
    <div
      role="region"
      aria-label="Filters"
      className="space-y-3 border-b border-hairline-soft bg-surface-1 px-5 py-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Filters
        </h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="w-3 h-3" /> Clear all
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="filter-media" className="mb-1 block text-xs text-muted-foreground">
            Content type
          </label>
          <div id="filter-media" className="flex flex-wrap gap-1.5">
            {MEDIA_OPTIONS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={mediaFilter === value ? "default" : "outline"}
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => onMediaFilterChange(value)}
              >
                <Icon className="w-3 h-3" />
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="filter-author" className="mb-1 block text-xs text-muted-foreground">
            Author
          </label>
          <Input
            id="filter-author"
            value={authorFilter}
            onChange={(e) => onAuthorFilterChange(e.target.value)}
            placeholder="Filter by username..."
            className="h-9 border-hairline-soft bg-surface-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="filter-date-from" className="mb-1 block text-xs text-muted-foreground">
              From
            </label>
            <Input
              id="filter-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="h-9 border-hairline-soft bg-surface-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="filter-date-to" className="mb-1 block text-xs text-muted-foreground">
              To
            </label>
            <Input
              id="filter-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="h-9 border-hairline-soft bg-surface-2 text-sm"
            />
          </div>
        </div>

        {tags.length > 0 && (
          <div>
            <label htmlFor="filter-tags" className="mb-1 block text-xs text-muted-foreground">
              Tags
            </label>
            <div id="filter-tags" className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                    selectedTags.includes(tag.id)
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => onTagToggle(tag.id)}
                  aria-pressed={selectedTags.includes(tag.id)}
                >
                  {tag.name}
                  <span className="ml-1 opacity-60">{tag._count.bookmarks}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
