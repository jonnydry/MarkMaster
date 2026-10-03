"use client";

import { createContext, useContext, type ReactNode } from "react";

import {
  useOrbitLibraryTag,
  type OrbitLibraryTagHandle,
} from "@/hooks/use-orbit-library-tag";

const OrbitLibraryTagContext = createContext<OrbitLibraryTagHandle | null>(null);

/**
 * Owns the whole-queue auto-tag run for the authenticated app. It lives in the
 * frame, not the Orbit page: kept pages pause their effects while hidden, and
 * a live run must keep polling and finish with its toast wherever you are.
 */
export function OrbitLibraryTagProvider({ children }: { children: ReactNode }) {
  const libraryTag = useOrbitLibraryTag();
  return (
    <OrbitLibraryTagContext.Provider value={libraryTag}>
      {children}
    </OrbitLibraryTagContext.Provider>
  );
}

export function useOrbitLibraryTagRun(): OrbitLibraryTagHandle {
  const value = useContext(OrbitLibraryTagContext);
  if (!value) {
    throw new Error("useOrbitLibraryTagRun must be used inside OrbitLibraryTagProvider");
  }
  return value;
}
