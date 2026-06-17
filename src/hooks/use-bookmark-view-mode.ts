"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { ViewMode } from "@/types";

const STORAGE_KEY = "markmaster-bookmark-view-mode";

function readStoredViewMode(): ViewMode {
  if (typeof window === "undefined") return "feed";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "feed" || stored === "compact" || stored === "grid") {
      return stored;
    }
  } catch {
    // ignore storage errors
  }
  return "feed";
}

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/** Shared feed / compact / grid preference across bookmark surfaces. */
export function useBookmarkViewMode() {
  const viewMode = useSyncExternalStore(
    subscribe,
    readStoredViewMode,
    () => "feed" as ViewMode
  );

  const setViewMode = useCallback((mode: ViewMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
    listeners.forEach((l) => l());
  }, []);

  return { viewMode, setViewMode };
}
