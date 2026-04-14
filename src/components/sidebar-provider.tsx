"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "markmaster-sidebar-expanded";

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
  // Fixed initial value so server HTML matches the client's first paint; then sync from localStorage.
  const [expanded, setExpandedState] = useState(true);
  const skipFirstPersist = useRef(true);

  useEffect(() => {
    setExpandedState(readStoredExpanded());
  }, []);

  useEffect(() => {
    if (skipFirstPersist.current) {
      skipFirstPersist.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, String(expanded));
    } catch {
      /* ignore */
    }
  }, [expanded]);

  const setExpanded = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setExpandedState(value);
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