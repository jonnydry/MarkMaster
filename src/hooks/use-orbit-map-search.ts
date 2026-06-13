"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import type {
  OrbitMapCanvasHandle,
  OrbitMapSelection,
} from "@/components/orbit/orbit-map-canvas-host";
import type { OrbitGraphNode } from "@/types";

interface UseOrbitMapSearchOptions {
  canvasRef: RefObject<OrbitMapCanvasHandle | null>;
  onSelect: (selection: OrbitMapSelection) => void;
}

/** Graph search box state; ranking + canvas highlight run in the map worker. */
export function useOrbitMapSearch({
  canvasRef,
  onSelect,
}: UseOrbitMapSearchOptions) {
  const [search, setSearch] = useState("");
  const [searchDeferred, setSearchDeferred] = useState("");
  const [searchResults, setSearchResults] = useState<OrbitGraphNode[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDeferredRef = useRef(searchDeferred);
  searchDeferredRef.current = searchDeferred;

  useEffect(() => {
    const trimmed = search.trim().toLowerCase();
    const handle = window.setTimeout(() => {
      setSearchDeferred(trimmed);
    }, 120);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (!searchDeferred) {
      setSearchResults([]);
    }
  }, [searchDeferred]);

  const handleSearchResults = useCallback((query: string, results: OrbitGraphNode[]) => {
    if (query !== searchDeferredRef.current) return;
    setSearchResults(results);
  }, []);

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
    searchInputRef,
    handleSearchResults,
    handleSearchResultSelect,
  };
}
