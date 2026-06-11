"use client";

import {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import type {
  OrbitMapCanvasHandle,
  OrbitMapSelection,
} from "@/components/orbit/orbit-map-canvas-host";
import { rankOrbitMapSearchResults } from "@/lib/orbit-map-search";
import type { OrbitGraphPayload } from "@/types";

interface UseOrbitMapSearchOptions {
  graph: OrbitGraphPayload | undefined;
  canvasRef: RefObject<OrbitMapCanvasHandle | null>;
  onSelect: (selection: OrbitMapSelection) => void;
}

/** Graph search box state: deferred query, ranked results, canvas highlight. */
export function useOrbitMapSearch({
  graph,
  canvasRef,
  onSelect,
}: UseOrbitMapSearchOptions) {
  const [search, setSearch] = useState("");
  const searchDeferred = useDeferredValue(search.trim().toLowerCase());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchResults = useMemo(() => {
    return graph ? rankOrbitMapSearchResults(graph.nodes, searchDeferred) : [];
  }, [graph, searchDeferred]);

  // Live canvas highlight for search matches (capped to keep messages small).
  const highlightedNodeIds = useMemo(() => {
    if (!searchDeferred) return null;
    return searchResults.slice(0, 400).map((node) => node.id);
  }, [searchDeferred, searchResults]);

  const handleSearchResultSelect = useCallback(
    (identity: OrbitMapSelection) => {
      onSelect(identity);
      canvasRef.current?.focusOn(identity);
    },
    [canvasRef, onSelect]
  );

  return {
    search,
    setSearch,
    searchDeferred,
    searchResults,
    highlightedNodeIds,
    searchInputRef,
    handleSearchResultSelect,
  };
}
