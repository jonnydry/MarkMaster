"use client";

import { useCallback, useEffect, useState } from "react";
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

/** Shared feed / compact / grid preference across bookmark surfaces. */
export function useBookmarkViewMode() {
  const [viewMode, setViewModeState] = useState<ViewMode>("feed");

  useEffect(() => {
    setViewModeState(readStoredViewMode());
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  }, []);

  return { viewMode, setViewMode };
}
