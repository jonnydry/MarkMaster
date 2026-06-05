"use client";

import type { RefObject } from "react";
import { Folder, Loader2, Search } from "lucide-react";

import { useOrbitalTheme } from "@/components/providers";
import { ORBIT_MAP_SEARCH_RESULT_LIMIT } from "@/lib/orbit-map-search";
import { cn } from "@/lib/utils";
import type { OrbitMapSelection } from "@/components/orbit/orbit-map-canvas-host";
import type { OrbitGraphNode } from "@/types";

interface OrbitMapCommandSurfaceProps {
  isFetching: boolean;
  hasGraph: boolean;
  search: string;
  searchQuery: string;
  searchResults: OrbitGraphNode[];
  searchInputRef: RefObject<HTMLInputElement | null>;
  onSearchChange: (value: string) => void;
  onResultSelect: (selection: OrbitMapSelection) => void;
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
  }
}

export function OrbitMapCommandSurface({
  isFetching,
  hasGraph,
  search,
  searchQuery,
  searchResults,
  searchInputRef,
  onSearchChange,
  onResultSelect,
}: OrbitMapCommandSurfaceProps) {
  const { isOrbital } = useOrbitalTheme();

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-30 sm:inset-x-auto sm:left-4 sm:w-[min(340px,calc(100%-2rem))] lg:w-[340px]">
      <div
        className={cn(
          "pointer-events-auto rounded-sm border px-2 py-1.5 shadow-sm backdrop-blur-xl",
          isOrbital
            ? "border-hairline-soft bg-surface-1/84"
            : "border-white/[0.07] bg-black/72"
        )}
      >
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            <Search
              className={cn(
                "size-4",
                isOrbital ? "text-muted-foreground" : "text-white/40"
              )}
            />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search graph"
            disabled={!hasGraph}
            className={cn(
              "h-8 w-full rounded-sm border-0 bg-transparent pl-8 pr-8 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60",
              isOrbital
                ? "text-foreground placeholder:text-muted-foreground"
                : "text-white placeholder:text-white/35"
            )}
          />
          {isFetching && (
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
              <Loader2 className="size-3.5 animate-spin text-white/55" />
            </div>
          )}
        </div>

        {searchQuery && searchResults.length > 0 && (
          <div
            className={cn(
              "absolute left-0 right-0 top-[calc(100%+0.375rem)] z-40 max-h-64 overflow-auto shadow-none backdrop-blur-xl",
              isOrbital
                ? "rounded-sm border border-hairline-soft bg-surface-1/90"
                : "rounded-sm border border-white/[0.08] bg-[#07111d]/82"
            )}
          >
            <ul className="py-1">
              {searchResults
                .slice(0, ORBIT_MAP_SEARCH_RESULT_LIMIT)
                .map((node) => (
                  <li key={node.id}>
                    <SearchResultButton
                      node={node}
                      isOrbital={isOrbital}
                      onClick={() => {
                        onResultSelect(selectionForNode(node));
                        onSearchChange("");
                      }}
                    />
                  </li>
                ))}
            </ul>
          </div>
        )}

        {searchQuery && searchResults.length === 0 && (
          <div
            className={cn(
              "absolute left-0 right-0 top-[calc(100%+0.375rem)] z-40 p-3 text-sm text-white/50 shadow-none backdrop-blur-xl",
              isOrbital
                ? "rounded-sm border border-hairline-soft bg-surface-1/90"
                : "rounded-sm border border-white/[0.08] bg-[#07111d]/82"
            )}
          >
            {`No results for "${searchQuery}"`}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchResultButton({
  node,
  isOrbital,
  onClick,
}: {
  node: OrbitGraphNode;
  isOrbital: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
        isOrbital
          ? "text-foreground/80 hover:bg-accent-soft hover:text-foreground"
          : "text-white/80 hover:bg-white/5 hover:text-white"
      )}
    >
      {node.kind === "tag" && (
        <>
          <span
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: node.color }}
          />
          <span className="truncate">{node.name}</span>
          <ResultKindLabel isOrbital={isOrbital}>Tag</ResultKindLabel>
        </>
      )}
      {node.kind === "collection" && (
        <>
          <Folder className="size-3.5 text-sky-300" />
          <span className="truncate">{node.name}</span>
          <ResultKindLabel isOrbital={isOrbital}>
            {node.variant === "x_folder" ? "X folder" : "Collection"}
          </ResultKindLabel>
        </>
      )}
      {node.kind === "bookmark" && (
        <>
          <span
            className={cn(
              "inline-block size-1.5 rounded-full",
              node.affiliated ? "bg-slate-200" : "bg-sky-300"
            )}
          />
          <span className="truncate">@{node.authorUsername}</span>
          <ResultKindLabel isOrbital={isOrbital}>Bookmark</ResultKindLabel>
        </>
      )}
    </button>
  );
}

function ResultKindLabel({
  children,
  isOrbital,
}: {
  children: string;
  isOrbital: boolean;
}) {
  return (
    <span
      className={cn(
        "ml-auto text-[10px] uppercase tracking-wider",
        isOrbital ? "text-muted-foreground" : "text-white/40"
      )}
    >
      {children}
    </span>
  );
}
