"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Ref,
} from "react";

import { COMPACT_SEARCH_FOCUS_EVENT } from "@/lib/compact-floating-search";

function getSearchInput(ref: Ref<HTMLInputElement>): HTMLInputElement | null {
  if (typeof ref === "function") return null;
  return ref?.current ?? null;
}

export function useCompactFloatingSearch(
  enabled: boolean,
  search: string,
  searchInputRef: Ref<HTMLInputElement>
) {
  const [expanded, setExpanded] = useState(false);
  const userCollapsedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setExpanded(false);
      userCollapsedRef.current = false;
      return;
    }
    if (search.trim() && !userCollapsedRef.current) {
      setExpanded(true);
    }
  }, [enabled, search]);

  useEffect(() => {
    if (!enabled) return;

    const open = () => {
      userCollapsedRef.current = false;
      setExpanded(true);
    };
    window.addEventListener(COMPACT_SEARCH_FOCUS_EVENT, open);
    return () => window.removeEventListener(COMPACT_SEARCH_FOCUS_EVENT, open);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !expanded) return;

    const frame = requestAnimationFrame(() => {
      getSearchInput(searchInputRef)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled, expanded, searchInputRef]);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      if (prev) {
        userCollapsedRef.current = true;
        getSearchInput(searchInputRef)?.blur();
        return false;
      }
      userCollapsedRef.current = false;
      return true;
    });
  }, [searchInputRef]);

  const closeIfEmpty = useCallback(() => {
    if (!search.trim()) {
      userCollapsedRef.current = true;
      setExpanded(false);
    }
  }, [search]);

  return {
    expanded,
    setExpanded,
    toggle,
    closeIfEmpty,
  };
}
