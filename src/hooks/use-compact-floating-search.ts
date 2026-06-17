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
  const [userToggledOpen, setUserToggledOpen] = useState(false);
  const [userCollapsed, setUserCollapsed] = useState(false);
  const userCollapsedRef = useRef(false);
  const [prevEnabled, setPrevEnabled] = useState(enabled);

  // Reset user intent when the feature is toggled off/on (React-recommended
  // "adjust state when a prop changes" pattern — no effect needed).
  if (prevEnabled !== enabled) {
    setPrevEnabled(enabled);
    setUserCollapsed(false);
    setUserToggledOpen(false);
  }

  // Keep ref in sync with state for use in effects that must not depend on
  // userCollapsed state directly (avoids cascading-render lint error).
  useEffect(() => {
    userCollapsedRef.current = userCollapsed;
  }, [userCollapsed]);

  const hasSearch = Boolean(search.trim());
  const expanded = enabled && !userCollapsed && (hasSearch || userToggledOpen);

  // Auto-expand when search text appears (syncing with external input).
  // Uses the ref so the effect does not depend on userCollapsed state.
  useEffect(() => {
    if (enabled && hasSearch && !userCollapsedRef.current) {
      setUserToggledOpen(true);
    }
  }, [enabled, hasSearch]);

  useEffect(() => {
    if (!enabled) return;

    const open = () => {
      setUserCollapsed(false);
      setUserToggledOpen(true);
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
    if (expanded) {
      setUserCollapsed(true);
      setUserToggledOpen(false);
      getSearchInput(searchInputRef)?.blur();
    } else {
      setUserCollapsed(false);
      setUserToggledOpen(true);
    }
  }, [expanded, searchInputRef]);

  const closeIfEmpty = useCallback(() => {
    if (!search.trim()) {
      setUserCollapsed(true);
      setUserToggledOpen(false);
    }
  }, [search]);

  return {
    expanded,
    setExpanded: setUserToggledOpen,
    toggle,
    closeIfEmpty,
  };
}
