"use client";

import { useState, useCallback } from "react";
import { Search, Image, Video, Link, FileText } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { TagWithCount, MediaFilter } from "@/types";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: TagWithCount[];
  onFilterChange: (filter: {
    mediaFilter?: MediaFilter;
    selectedTag?: string;
  }) => void;
}

const MEDIA_FILTERS: { value: MediaFilter; label: string; icon: React.ElementType; shortcut: string }[] = [
  { value: "all", label: "All", icon: FileText, shortcut: "⌘1" },
  { value: "images", label: "With images", icon: Image, shortcut: "⌘2" },
  { value: "video", label: "Videos", icon: Video, shortcut: "⌘3" },
  { value: "links", label: "Links only", icon: Link, shortcut: "⌘4" },
  { value: "text-only", label: "Text only", icon: FileText, shortcut: "⌘5" },
];

export function CommandPalette({
  open,
  onOpenChange,
  tags,
  onFilterChange,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");

  const handleFilterSelect = useCallback((filter: { mediaFilter?: MediaFilter; selectedTag?: string }) => {
    onFilterChange(filter);
    onOpenChange(false);
  }, [onFilterChange, onOpenChange]);

  const filteredTags = tags.filter((tag) =>
    tag.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-[560px] overflow-hidden" key={open ? "open" : "closed"}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or type a command..."
            className="border-0 p-0 h-auto text-sm focus:ring-0 focus:outline-none"
            autoFocus
          />
          <kbd className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
            ESC
          </kbd>
        </div>

        <div className="p-2 max-h-[400px] overflow-y-auto">
          {query === "" && (
            <>
              <div className="px-2 py-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Quick Filters
                </p>
                <div className="space-y-1">
                  {MEDIA_FILTERS.map(({ value, label, icon: Icon, shortcut }) => (
                    <button
                      key={value}
                      onClick={() => handleFilterSelect({ mediaFilter: value })}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
                    >
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className="flex-1 text-left">{label}</span>
                      <span className="text-xs text-muted-foreground">{shortcut}</span>
                    </button>
                  ))}
                </div>
              </div>

              {tags.length > 0 && (
                <div className="px-2 py-1.5 border-t border-border mt-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Tags
                  </p>
                  <div className="space-y-1">
                    {tags.slice(0, 6).map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => handleFilterSelect({ selectedTag: tag.id })}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
                      >
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="flex-1 text-left">{tag.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {tag._count.bookmarks}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {query !== "" && filteredTags.length > 0 && (
            <div className="px-2 py-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Tags
              </p>
              <div className="space-y-1">
                {filteredTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => handleFilterSelect({ selectedTag: tag.id })}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="flex-1 text-left">{tag.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {tag._count.bookmarks}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
