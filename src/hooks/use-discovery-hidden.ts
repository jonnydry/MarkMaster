"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "markmaster-discovery-hidden";
const CHANGE_EVENT = "markmaster-discovery-hidden-change";

function readHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("discovery") === "1") {
      return false;
    }
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

function writeHidden(value: boolean) {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("discovery") === "1") {
      url.searchParams.delete("discovery");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    localStorage.setItem(STORAGE_KEY, String(value));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* ignore storage errors */
  }
}

/** Whether the dashboard Discovery carousel is hidden (persisted, shown by default). */
export function useDiscoveryHidden() {
  const hidden = useSyncExternalStore(subscribe, readHidden, () => false);
  const setHidden = useCallback((value: boolean) => writeHidden(value), []);
  return { hidden, setHidden };
}
