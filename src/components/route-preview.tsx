"use client";

import { createContext, useContext, type ReactNode } from "react";

type RoutePreviewValue = {
  shownPath: string;
  showRoute: (href: string) => void;
};

const RoutePreviewContext = createContext<RoutePreviewValue | null>(null);

let visiblePath = "";

/** The page on screen, including a click the address bar has not caught up to. */
export function noteVisiblePath(path: string) {
  visiblePath = path;
}

export function visiblePathname() {
  if (visiblePath) return visiblePath;
  if (typeof window === "undefined") return "";
  return window.location.pathname;
}

export function RoutePreviewProvider({
  value,
  children,
}: {
  value: RoutePreviewValue;
  children: ReactNode;
}) {
  return (
    <RoutePreviewContext.Provider value={value}>{children}</RoutePreviewContext.Provider>
  );
}

export function useRoutePreview() {
  const value = useContext(RoutePreviewContext);
  if (!value) {
    throw new Error("useRoutePreview must be used inside RoutePreviewProvider");
  }
  return value;
}
