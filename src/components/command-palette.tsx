"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Search, Image, Video, Link, FileText } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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

type CommandItem =
  | { kind: "media"; value: MediaFilter; label: string; icon: React.ElementType; shortcut: string }
  | { kind: "tag"; id: string; name: string; color: string; count: number };

export function CommandPalette({
  open,
  onOpenChange,
  tags,
  onFilterChange,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const filteredTags = useMemo(
    () => tags.filter((tag) => tag.name.toLowerCase().includes(query.toLowerCase())),
    [tags, query]
  );

  const items = useMemo<CommandItem[]>(() => {
    if (query === "") {
      const media = MEDIA_FILTERS.map((f) => ({ kind: "media" as const, ...f }));
      const tagItems = tags.slice(0, 6).map((t) => ({
        kind: "tag" as const,
        id: t.id,
        name: t.name,
        color: t.color,
        count: t._count.bookmarks,
      }));
      return [...media, ...tagItems];
    }
    if (filteredTags.length > 0) {
      return filteredTags.map((t) => ({
        kind: "tag" as const,
        id: t.id,
        name: t.name,
        color: t.color,
        count: t._count.bookmarks,
      }));
    }
    return [];
  }, [query, tags, filteredTags]);

  useEffect(() => {
    if (focusedIndex >= 0) {
      const el = document.getElementById(`cmd-item-${focusedIndex}`);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusedIndex]);

  const handleFilterSelect = useCallback(
    (filter: { mediaFilter?: MediaFilter; selectedTag?: string }) => {
      onFilterChange(filter);
      onOpenChange(false);
    },
    [onFilterChange, onOpenChange]
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setQuery("");
        setFocusedIndex(-1);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      setFocusedIndex(-1);
    },
    []
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (items.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % items.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev < 0 ? items.length - 1 : (prev - 1 + items.length) % items.length
        );
        break;
      case "Home":
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setFocusedIndex(items.length - 1);
        break;
      case "Enter": {
        e.preventDefault();
        const item = items[focusedIndex];
        if (!item) return;
        if (item.kind === "media") {
          handleFilterSelect({ mediaFilter: item.value });
        } else {
          handleFilterSelect({ selectedTag: item.id });
        }
        break;
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="p-0 gap-0 max-w-[560px] overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <Input
            value={query}
            onChange={handleQueryChange}
            placeholder="Search or type a command..."
            className="border-0 p-0 h-auto text-sm bg-transparent placeholder:text-muted-foreground/50 focus:ring-0 focus:outline-none"
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            aria-activedescendant={focusedIndex >= 0 ? `cmd-item-${focusedIndex}` : undefined}
          />
          <kbd className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
            ESC
          </kbd>
        </div>

        <div id="cmd-list" role="listbox" className="p-2 max-h-[400px] overflow-y-auto">
          {items.map((item, i) => {
            const isFocused = i === focusedIndex;
            const showQuickFiltersHeading = query === "" && i === 0 && item.kind === "media";
            const showTagsHeading =
              query === "" && item.kind === "tag" && items[i - 1]?.kind === "media";
            const showSearchTagsHeading = query !== "" && i === 0;

            return (
              <div key={item.kind === "media" ? item.value : item.id}>
                {showQuickFiltersHeading && (
                  <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Quick Filters
                  </p>
                )}
                {(showTagsHeading || showSearchTagsHeading) && (
                  <p className="px-2 py-1.5 mt-2 border-t border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Tags
                  </p>
                )}
                <button
                  id={`cmd-item-${i}`}
                  role="option"
                  aria-selected={isFocused}
                  onClick={() => {
                    if (item.kind === "media") {
                      handleFilterSelect({ mediaFilter: item.value });
                    } else {
                      handleFilterSelect({ selectedTag: item.id });
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-muted",
                    isFocused && "bg-muted"
                  )}
                >
                  {item.kind === "media" ? (
                    <>
                      <item.icon className="w-4 h-4 text-muted-foreground" />
                      <span className="flex-1 text-left">{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.shortcut}</span>
                    </>
                  ) : (
                    <>
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="flex-1 text-left">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{item.count}</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}

          {items.length === 0 && query !== "" && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No tags match <span className="font-medium text-foreground">{query}</span>.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
