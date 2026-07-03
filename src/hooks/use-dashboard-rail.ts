"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "markmaster-dashboard-rail-collapsed";
const CHANGE_EVENT = "markmaster-dashboard-rail-change";

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* ignore storage errors */
  }
}

/**
 * Whether the dashboard right rail is collapsed (persisted, expanded by default).
 * The rail is a wide-screen enhancement; below `appDashboardRailMediaQuery`
 * (1152px) it is not rendered.
 */
export function useDashboardRail() {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const setCollapsed = useCallback(
    (value: boolean) => writeCollapsed(value),
    []
  );
  return { collapsed, setCollapsed };
}
