"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "markmaster-page-header-compact";
const CHANGE_EVENT = "markmaster-page-header-compact-change";

/** Compact is the default header layout; only an explicit opt-out ("false") disables it. */
const DEFAULT_COMPACT = true;

function readStoredCompact(): boolean {
  if (typeof window === "undefined") return DEFAULT_COMPACT;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? DEFAULT_COMPACT : stored === "true";
  } catch {
    return DEFAULT_COMPACT;
  }
}

function subscribeStoredCompact(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const handleChange = () => onStoreChange();
  window.addEventListener("storage", handleChange);
  window.addEventListener(CHANGE_EVENT, handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(CHANGE_EVENT, handleChange);
  };
}

function writeStoredCompact(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* ignore */
  }
}

function subscribeHydrated() {
  return () => {};
}

export function usePageHeaderCompact() {
  const storedCompact = useSyncExternalStore(
    subscribeStoredCompact,
    readStoredCompact,
    () => DEFAULT_COMPACT
  );

  const hydrated = useSyncExternalStore(
    subscribeHydrated,
    () => true,
    () => false
  );

  // Render the default during SSR + hydration so the common (default) case never
  // flashes; only an explicit opt-out re-renders once after hydration.
  const compact = hydrated ? storedCompact : DEFAULT_COMPACT;

  const setCompact = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    writeStoredCompact(
      typeof value === "function" ? value(readStoredCompact()) : value
    );
  }, []);

  const toggleCompact = useCallback(() => {
    setCompact((current) => !current);
  }, [setCompact]);

  return { compact, setCompact, toggleCompact };
}
