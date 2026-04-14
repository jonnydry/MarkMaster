"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const STORAGE_KEY = "markmaster-sidebar-expanded";
const SIDEBAR_CHANGE_EVENT = "markmaster-sidebar-expanded-change";

function readStoredExpanded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

function subscribeStoredExpanded(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const handleChange = () => onStoreChange();
  window.addEventListener("storage", handleChange);
  window.addEventListener(SIDEBAR_CHANGE_EVENT, handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(SIDEBAR_CHANGE_EVENT, handleChange);
  };
}

function writeStoredExpanded(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
    window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT));
  } catch {
    /* ignore */
  }
}

export type SidebarContextValue = {
  expanded: boolean;
  setExpanded: (value: boolean | ((prev: boolean) => boolean)) => void;
  toggle: () => void;
};

/** Used when no provider is mounted (should not happen in app shell; avoids hard crash). */
const SIDEBAR_FALLBACK: SidebarContextValue = {
  expanded: true,
  setExpanded: () => {},
  toggle: () => {},
};

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (ctx === undefined) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[MarkMaster] useSidebar: no SidebarProvider ancestor — sidebar expand state will not persist."
      );
    }
    return SIDEBAR_FALLBACK;
  }
  return ctx;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const expanded = useSyncExternalStore(
    subscribeStoredExpanded,
    readStoredExpanded,
    () => true
  );

  const setExpanded = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      writeStoredExpanded(
        typeof value === "function" ? value(readStoredExpanded()) : value
      );
    },
    []
  );

  const toggle = useCallback(() => {
    setExpanded((e) => !e);
  }, [setExpanded]);

  const value = useMemo(
    () => ({ expanded, setExpanded, toggle }),
    [expanded, setExpanded, toggle]
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}
