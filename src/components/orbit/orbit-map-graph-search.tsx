"use client";

import type { Ref } from "react";
import { Folder, Loader2 } from "lucide-react";

import { SearchBar } from "@/components/search-bar";
import { ORBIT_MAP_SEARCH_RESULT_LIMIT } from "@/lib/orbit-map-search";
import { orbitMapFloatingMenuClass } from "@/lib/orbit-map-chrome";
import { highlightSearchShellClass } from "@/lib/highlight-chrome";
import {
  appToolbarSurfaceShellClassName,
} from "@/lib/app-chrome";
import { cn } from "@/lib/utils";
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
}: OrbitMapGraphSearchProps) {
  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
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

      {searchQuery && searchResults.length > 0 ? (
        <div
          className={cn(
            orbitMapFloatingMenuClass(),
            "absolute left-0 right-0 top-[calc(100%+0.375rem)] z-40 max-h-64 overflow-auto"
          )}
        >
          <ul className="py-1">
            {searchResults.slice(0, ORBIT_MAP_SEARCH_RESULT_LIMIT).map((node) => (
              <li key={node.id}>
                <SearchResultButton
                  node={node}
                  onClick={() => {
                    onResultSelect(selectionForNode(node));
                    onSearchChange("");
                  }}
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
            "absolute left-0 right-0 top-[calc(100%+0.375rem)] z-40 p-3 text-sm text-muted-foreground"
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
}: {
  node: OrbitGraphNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground/85 transition-colors hover:bg-accent-soft hover:text-foreground"
    >
      {node.kind === "tag" && (
        <>
          <span
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: node.color }}
          />
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
