"use client";

import { useState, type KeyboardEvent, type Ref } from "react";
import { Folder, Loader2 } from "lucide-react";

import { SearchBar } from "@/components/search-bar";
import { ORBIT_MAP_SEARCH_RESULT_LIMIT } from "@/lib/orbit-map-search";
import { orbitMapFloatingMenuClass } from "@/lib/orbit-map-chrome";
import { highlightSearchShellClass } from "@/lib/highlight-chrome";
import {
  appToolbarSurfaceShellClassName,
} from "@/lib/app-chrome";
import { cn } from "@/lib/utils";
import { TagDot } from "@/components/tag-dot";
import type { OrbitMapSelection } from "@/components/orbit/orbit-map-canvas-host";
import type { OrbitGraphNode } from "@/types";

interface OrbitMapGraphSearchProps {
  isFetching: boolean;
  hasGraph: boolean;
  search: string;
  searchQuery: string;
  searchResults: OrbitGraphNode[];
  searchInputRef: Ref<HTMLInputElement | null>;
  onSearchChange: (value: string) => void;
  onResultSelect: (selection: OrbitMapSelection) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  /** Skip toolbar well chrome when nested inside CompactFloatingSearchBubble. */
  embedded?: boolean;
}

function selectionForNode(node: OrbitGraphNode): OrbitMapSelection {
  switch (node.kind) {
    case "core":
      return { kind: "core", id: node.id };
    case "tag":
      return { kind: "tag", id: node.id };
    case "collection":
      return { kind: "collection", id: node.id };
    case "bookmark":
      return { kind: "bookmark", id: node.id };
    case "overflow":
      return { kind: "overflow", id: node.id };
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

export function OrbitMapGraphSearch({
  isFetching,
  hasGraph,
  search,
  searchQuery,
  searchResults,
  searchInputRef,
  onSearchChange,
  onResultSelect,
  className,
  inputClassName,
  placeholder = "Search graph by tag, collection, or author…",
  embedded = false,
}: OrbitMapGraphSearchProps) {
  const visibleResults = searchResults.slice(0, ORBIT_MAP_SEARCH_RESULT_LIMIT);
  const [activeIndex, setActiveIndex] = useState(0);
  const hasResults = Boolean(searchQuery && visibleResults.length > 0);

  const selectNode = (node: OrbitGraphNode) => {
    onResultSelect(selectionForNode(node));
    onSearchChange("");
    setActiveIndex(0);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && search) {
      event.preventDefault();
      event.stopPropagation();
      onSearchChange("");
      setActiveIndex(0);
      return;
    }
    if (!hasResults) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        index + 1 >= visibleResults.length ? 0 : index + 1
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        index <= 0 ? visibleResults.length - 1 : index - 1
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const node = visibleResults[activeIndex] ?? visibleResults[0];
      if (node) selectNode(node);
    }
  };

  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <div
        className={
          embedded
            ? "min-w-0 w-full"
            : cn(highlightSearchShellClass, appToolbarSurfaceShellClassName)
        }
      >
        <SearchBar
          ref={searchInputRef}
          glass
          value={search}
          onChange={(value) => {
            onSearchChange(value);
            setActiveIndex(0);
          }}
          onKeyDown={handleSearchKeyDown}
          disabled={!hasGraph}
          placeholder={placeholder}
          inputClassName={cn("h-9", inputClassName)}
        />
        {isFetching ? (
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          </div>
        ) : null}
      </div>

      {hasResults ? (
        <div
          className={cn(
            orbitMapFloatingMenuClass(),
            "absolute left-0 right-0 top-[calc(100%+0.375rem)] z-40 max-h-64 animate-in fade-in-0 zoom-in-95 overflow-auto"
          )}
        >
          <ul className="py-1" role="listbox" aria-label="Graph search results">
            {visibleResults.map((node, index) => (
              <li key={node.id} role="option" aria-selected={index === activeIndex}>
                <SearchResultButton
                  node={node}
                  active={index === activeIndex}
                  onClick={() => selectNode(node)}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {searchQuery && searchResults.length === 0 ? (
        <div
          className={cn(
            orbitMapFloatingMenuClass(),
            "absolute left-0 right-0 top-[calc(100%+0.375rem)] z-40 animate-in fade-in-0 zoom-in-95 p-3 text-sm text-muted-foreground"
          )}
        >
          {`No results for "${searchQuery}"`}
        </div>
      ) : null}
    </div>
  );
}

function SearchResultButton({
  node,
  onClick,
  active = false,
}: {
  node: OrbitGraphNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45",
        active
          ? "bg-accent-soft text-foreground"
          : "text-foreground/85 hover:bg-accent-soft hover:text-foreground"
      )}
    >
      {node.kind === "tag" && (
        <>
          <TagDot name={node.name} color={node.color} size={8} />
          <span className="truncate">{node.name}</span>
          <ResultKindLabel>Tag</ResultKindLabel>
        </>
      )}
      {node.kind === "collection" && (
        <>
          <Folder className="size-3.5 text-primary" />
          <span className="truncate">{node.name}</span>
          <ResultKindLabel>
            {node.variant === "x_folder" ? "X folder" : "Collection"}
          </ResultKindLabel>
        </>
      )}
      {node.kind === "bookmark" && (
        <>
          <span
            className={cn(
              "inline-block size-1.5 rounded-full",
              node.affiliated ? "bg-muted-foreground/45" : "bg-primary"
            )}
          />
          <span className="truncate">@{node.authorUsername}</span>
          <ResultKindLabel>Bookmark</ResultKindLabel>
        </>
      )}
    </button>
  );
}

function ResultKindLabel({ children }: { children: string }) {
  return (
    <span className="ml-auto text-2xs uppercase tracking-wider text-muted-foreground/70">
      {children}
    </span>
  );
}
