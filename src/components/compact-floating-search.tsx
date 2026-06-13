"use client";

import { useEffect, type Ref } from "react";
import { Search } from "lucide-react";

import { SearchBar } from "@/components/search-bar";
import {
  appToolbarSurfaceClassName,
  appToolbarSurfaceShellClassName,
} from "@/lib/app-chrome";
import { bookmarkFeedColumnClassName } from "@/lib/bookmark-feed-layout";
import {
  highlightActiveClass,
  highlightInteractiveClass,
  highlightSearchShellClass,
} from "@/lib/highlight-chrome";
import { cn } from "@/lib/utils";

type CompactSearchTriggerProps = {
  onToggle: () => void;
  expanded: boolean;
  hasQuery: boolean;
  className?: string;
};

export function CompactSearchTrigger({
  onToggle,
  expanded,
  hasQuery,
  className,
}: CompactSearchTriggerProps) {
  return (
    <button
      type="button"
      data-compact-search-trigger
      onMouseDown={(event) => {
        // Keep focus on the search input until click runs so blur does not
        // collapse the strip before toggle re-expands it.
        event.preventDefault();
      }}
      onClick={onToggle}
      aria-label={expanded ? "Close search" : "Search"}
      aria-expanded={expanded}
      className={cn(
        "relative inline-flex size-8 shrink-0 items-center justify-center rounded-sm border border-hairline-strong text-muted-foreground transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
        appToolbarSurfaceClassName,
        hasQuery
          ? highlightActiveClass
          : cn(highlightInteractiveClass, "hover:text-foreground"),
        className
      )}
    >
      <Search className="size-4" aria-hidden />
      {hasQuery ? (
        <span
          className="absolute right-1 top-1 size-1.5 rounded-full bg-primary"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

type CompactFloatingSearchStripProps = {
  expanded: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  searchInputRef: Ref<HTMLInputElement>;
  placeholder: string;
  onCloseIfEmpty: () => void;
  className?: string;
};

export function CompactFloatingSearchStrip({
  expanded,
  search,
  onSearchChange,
  searchInputRef,
  placeholder,
  onCloseIfEmpty,
  className,
}: CompactFloatingSearchStripProps) {
  useEffect(() => {
    if (!expanded) return;

    const input =
      typeof searchInputRef === "function" || searchInputRef == null
        ? null
        : searchInputRef.current;
    if (!input) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || search.trim()) return;
      event.preventDefault();
      input.blur();
      onCloseIfEmpty();
    };

    input.addEventListener("keydown", onKeyDown);
    return () => input.removeEventListener("keydown", onKeyDown);
  }, [expanded, onCloseIfEmpty, search, searchInputRef]);

  if (!expanded) return null;

  return (
    <div
      className={cn(
        "relative mt-2 min-w-0 w-full max-w-full pb-0.5 animate-slide-down-fade motion-reduce:animate-none",
        className
      )}
      onBlur={(event) => {
        const related = event.relatedTarget as Node | null;
        if (related instanceof HTMLElement && related.closest("[data-compact-search-trigger]")) {
          return;
        }
        if (!event.currentTarget.contains(related)) {
          onCloseIfEmpty();
        }
      }}
    >
      <div
        className={cn(
          "relative z-[var(--z-sticky-subbar)] mx-auto w-full",
          bookmarkFeedColumnClassName
        )}
      >
        <div
          className={cn(
            highlightSearchShellClass,
            appToolbarSurfaceShellClassName
          )}
        >
          <SearchBar
            ref={searchInputRef}
            glass
            value={search}
            onChange={onSearchChange}
            placeholder={placeholder}
            inputClassName="h-9"
          />
        </div>
      </div>
    </div>
  );
}
