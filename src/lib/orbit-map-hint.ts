export const ORBIT_MAP_HINT_STORAGE_KEY = "orbit-map-hint-dismissed";

type HintStorage = Pick<Storage, "getItem" | "setItem">;

function resolveStorage(storage?: HintStorage | null): HintStorage | null {
  if (storage !== undefined) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

/**
 * The canvas how-to hint ("Click to inspect · Scroll to zoom · Drag to pan")
 * shows until the first time someone clicks, pans, or zooms the map.
 */
export function getOrbitMapHintDismissed(storage?: HintStorage | null): boolean {
  try {
    return resolveStorage(storage)?.getItem(ORBIT_MAP_HINT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setOrbitMapHintDismissed(storage?: HintStorage | null) {
  try {
    resolveStorage(storage)?.setItem(ORBIT_MAP_HINT_STORAGE_KEY, "1");
  } catch {
    // Private mode / blocked storage: the hint just returns next visit.
  }
}
