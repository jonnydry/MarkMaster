"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ViewMode } from "@/types";

const STORAGE_KEY = "markmaster-bookmark-view-mode";

function readStoredViewMode(fallback: ViewMode): ViewMode {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "feed" || stored === "compact" || stored === "grid") {
      return stored;
    }
  } catch {
    // ignore storage errors
  }
  return fallback;
}

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Shared feed / compact / grid preference across bookmark surfaces. `defaultViewMode`
 * is the fallback before the user has made an explicit choice (persisted across surfaces).
 *
 * Waits until after hydration to apply localStorage so server markup matches the first
 * client paint (avoids layout swaps and mismatched skeleton/list chrome).
 */
export function useBookmarkViewMode(defaultViewMode: ViewMode = "feed") {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const storedViewMode = useSyncExternalStore(
    subscribe,
    () => readStoredViewMode(defaultViewMode),
    () => defaultViewMode
  );

  const viewMode = hasHydrated ? storedViewMode : defaultViewMode;

  const setViewMode = useCallback((mode: ViewMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
    listeners.forEach((listener) => listener());
  }, []);

  return { viewMode, setViewMode };
}
