"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Search, Image, Video, Link, FileText, Palette, Type } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useColorTheme, useFontMode } from "@/components/providers";
import { COLOR_THEMES } from "@/lib/color-themes";
import { TYPOGRAPHY_PRESETS } from "@/lib/typography-presets";
import { useTypography } from "@/hooks/use-typography";
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
  | { kind: "tag"; id: string; name: string; color: string; count: number }
  | { kind: "action"; id: string; label: string; description?: string; action: () => void; icon?: React.ElementType; active?: boolean };

export function CommandPalette({
  open,
  onOpenChange,
  tags,
  onFilterChange,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const normalizedQuery = query.trim().toLowerCase();

  const { colorTheme, setColorTheme } = useColorTheme();
  const { typographyPreset, setTypographyPreset } = useFontMode();
  const t = useTypography();

  const filteredTags = useMemo(
    () =>
      normalizedQuery
        ? tags.filter((tag) => tag.name.toLowerCase().includes(normalizedQuery))
        : tags,
    [tags, normalizedQuery]
  );

  const items = useMemo<CommandItem[]>(() => {
    if (normalizedQuery === "") {
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
  }, [normalizedQuery, tags, filteredTags]);

  // Appearance actions — shown when query matches or is empty for discoverability
  const appearanceActions = useMemo(() => {
    const q = normalizedQuery;
    if (
      !q ||
      q.includes("color") ||
      q.includes("accent") ||
      q.includes("theme") ||
      q.includes("mono") ||
      q.includes("font") ||
      q.includes("type") ||
      q.includes("typography") ||
      q.includes("design") ||
      COLOR_THEMES.some((theme) => theme.name.toLowerCase().includes(q)) ||
      TYPOGRAPHY_PRESETS.some((preset) =>
        preset.name.toLowerCase().includes(q)
      )
    ) {
      const colorActions = COLOR_THEMES.map((theme) => ({
        kind: "action" as const,
        id: `color-${theme.id}`,
        label: `Use ${theme.name}`,
        description: theme.description,
        action: () => setColorTheme(theme.id),
        icon: Palette,
        active: colorTheme === theme.id,
      }));
      const typographyActions = TYPOGRAPHY_PRESETS.map((preset) => ({
        kind: "action" as const,
        id: `typography-${preset.id}`,
        label: `Use ${preset.name} Typography`,
        description: `${preset.bodyFace} body, ${preset.dataFace} data`,
        action: () => setTypographyPreset(preset.id),
        icon: Type,
        active: typographyPreset === preset.id,
      }));
      return [
        ...colorActions,
        ...typographyActions,
      ];
    }
    return [];
  }, [
    normalizedQuery,
    colorTheme,
    typographyPreset,
    setColorTheme,
    setTypographyPreset,
  ]);

  const allItems = useMemo(() => {
    // Show appearance actions at the top when relevant for discoverability
    if (appearanceActions.length > 0) {
      return [...appearanceActions, ...items];
    }
    return items;
  }, [appearanceActions, items]);

  // Improved heading logic (kind-transition based, robust to appearanceActions prepending at top)
  const getPrevKind = (idx: number) => (idx > 0 ? allItems[idx - 1]?.kind : null);

  const resolvedFocusedIndex =
    allItems.length === 0
      ? -1
      : focusedIndex < 0 || focusedIndex >= allItems.length
        ? 0
        : focusedIndex;

  useEffect(() => {
    if (resolvedFocusedIndex >= 0) {
      const el = document.getElementById(`cmd-item-${resolvedFocusedIndex}`);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [resolvedFocusedIndex]);

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

  const handleFilterSelect = useCallback(
    (filter: { mediaFilter?: MediaFilter; selectedTag?: string }) => {
      onFilterChange(filter);
      handleOpenChange(false);
    },
    [onFilterChange, handleOpenChange]
  );

  const executeActionAndClose = useCallback((actionFn: () => void) => {
    actionFn();
    handleOpenChange(false);
  }, [handleOpenChange]);

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      setFocusedIndex(-1);
    },
    []
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (allItems.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev < 0 ? 0 : (prev + 1) % allItems.length
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev < 0 ? allItems.length - 1 : (prev - 1 + allItems.length) % allItems.length
        );
        break;
      case "Home":
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setFocusedIndex(allItems.length - 1);
        break;
      case "Enter": {
        e.preventDefault();
        const item = allItems[resolvedFocusedIndex];
        if (!item) return;
        if (item.kind === "media") {
          handleFilterSelect({ mediaFilter: item.value });
        } else if (item.kind === "tag") {
          handleFilterSelect({ selectedTag: item.id });
        } else if (item.kind === "action") {
          executeActionAndClose(item.action);
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
        showCloseButton={false}
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
            aria-activedescendant={
              resolvedFocusedIndex >= 0 ? `cmd-item-${resolvedFocusedIndex}` : undefined
            }
          />
          <kbd className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
            ESC
          </kbd>
        </div>

        <div
          id="cmd-list"
          role="listbox"
          className="p-2 max-h-[400px] overflow-y-auto"
        >
          {allItems.map((item, i) => {
            const isFocused = i === resolvedFocusedIndex;
            const prevKind = getPrevKind(i);
            const showAppearanceHeading =
              (appearanceActions.length > 0) && i === 0;
            // Robust to prepend: show Quick Filters on first media, or first media after actions group
            const showQuickFiltersHeading =
              normalizedQuery === "" &&
              item.kind === "media" &&
              (prevKind === "action" || (prevKind === null && appearanceActions.length === 0));
            const showTagsHeading =
              normalizedQuery === "" && item.kind === "tag" && prevKind === "media";
            const showSearchTagsHeading = normalizedQuery !== "" && i === 0 && item.kind === "tag";

            return (
              <div key={item.kind === "media" ? item.value : item.id}>
                {showAppearanceHeading && (
                  <p className={cn(
                    "px-2 py-1.5 text-xs font-semibold uppercase tracking-wider",
                    t.monoNative ? t.label : "text-muted-foreground"
                  )}>
                    Appearance
                  </p>
                )}
                {showQuickFiltersHeading && (
                  <p className={cn(
                    "px-2 py-1.5 text-xs font-semibold uppercase tracking-wider",
                    t.monoNative ? t.label : "text-muted-foreground"
                  )}>
                    Quick Filters
                  </p>
                )}
                {(showTagsHeading || showSearchTagsHeading) && (
                  <p className={cn(
                    "px-2 py-1.5 mt-2 border-t border-border text-xs font-semibold uppercase tracking-wider",
                    t.monoNative ? t.label : "text-muted-foreground"
                  )}>
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
                    } else if (item.kind === "tag") {
                      handleFilterSelect({ selectedTag: item.id });
                    } else if (item.kind === "action") {
                      executeActionAndClose(item.action);
                    }
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all hover:bg-muted",
                    isFocused && "menu-selection-active pr-5"
                  )}
                >
                  {item.kind === "media" ? (
                    <>
                      <item.icon className="w-4 h-4 text-muted-foreground" />
                      <span className="flex-1 text-left">{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.shortcut}</span>
                    </>
                  ) : item.kind === "tag" ? (
                    <>
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="flex-1 text-left">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{item.count}</span>
                    </>
                  ) : (
                    <>
                      {item.icon ? (
                        <item.icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <div className="w-4 h-4 rounded-sm shrink-0 bg-muted text-muted-foreground" />
                      )}
                      <div className="flex-1 text-left min-w-0">
                        <div className="flex items-center gap-2">
                          <span>{item.label}</span>
                          {item.active && (
                            <span className="rounded-sm border border-primary/30 bg-primary/10 px-1.5 py-0 text-[9px] font-medium uppercase tracking-wider text-primary">
                              Active
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                            {item.description}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </button>
              </div>
            );
          })}

          {allItems.length === 0 && normalizedQuery !== "" && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No tags match <span className="font-medium text-foreground">{query}</span>.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
