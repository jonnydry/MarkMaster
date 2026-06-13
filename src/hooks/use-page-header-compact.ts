"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "markmaster-page-header-compact";
const CHANGE_EVENT = "markmaster-page-header-compact-change";

function readStoredCompact(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
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
    () => false
  );

  const hydrated = useSyncExternalStore(
    subscribeHydrated,
    () => true,
    () => false
  );

  const compact = hydrated ? storedCompact : false;

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
