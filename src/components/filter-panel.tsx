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
    <div className="space-y-4 px-6 py-3 border-b border-border bg-card/50">
      <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Filters
          </h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-6 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="w-3 h-3 mr-1" /> Clear all
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            Content type
          </label>
          <div className="flex flex-wrap gap-1.5">
            {MEDIA_OPTIONS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={mediaFilter === value ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => onMediaFilterChange(value)}
              >
                <Icon className="w-3 h-3" />
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            Author
          </label>
          <Input
            value={authorFilter}
            onChange={(e) => onAuthorFilterChange(e.target.value)}
            placeholder="Filter by username..."
            className="h-8 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              From
            </label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              To
            </label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {tags.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
                    selectedTags.includes(tag.id)
                      ? "bg-primary/10 text-primary"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => onTagToggle(tag.id)}
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
