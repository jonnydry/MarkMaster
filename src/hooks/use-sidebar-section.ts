"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const STORAGE_KEY = "markmaster-sidebar-sections";
const CHANGE_EVENT = "markmaster-sidebar-sections-change";

type SectionState = Record<string, boolean>;

const EMPTY_STATE: SectionState = {};

// `useSyncExternalStore` requires getSnapshot() to return a referentially
// stable value when nothing changed, or it triggers a re-render loop. Cache
// the parsed result by the raw localStorage string.
let cachedRaw: string | null = null;
let cachedState: SectionState = EMPTY_STATE;

function readState(): SectionState {
  if (typeof window === "undefined") return EMPTY_STATE;
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY_STATE;
  }
  if (raw === cachedRaw) return cachedState;
  cachedRaw = raw;
  if (!raw) {
    cachedState = EMPTY_STATE;
    return cachedState;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    cachedState =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as SectionState)
        : EMPTY_STATE;
  } catch {
    cachedState = EMPTY_STATE;
  }
  return cachedState;
}

function writeState(next: SectionState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* ignore */
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

export function useSidebarSection(id: string, defaultOpen = true) {
  const state = useSyncExternalStore(subscribe, readState, () => EMPTY_STATE);
  const stored = state[id];
  const open = stored === undefined ? defaultOpen : stored;

  const setOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const current = readState();
      const prev = current[id] ?? defaultOpen;
      const next = typeof value === "function" ? value(prev) : value;
      writeState({ ...current, [id]: next });
    },
    [id, defaultOpen]
  );

  const toggle = useCallback(() => setOpen((v) => !v), [setOpen]);

  return useMemo(() => ({ open, setOpen, toggle }), [open, setOpen, toggle]);
}
