export const ORBIT_MAP_LIVING_STORAGE_KEY = "orbit-map-living";

type LivingLookup = {
  search?: string;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  matchMedia?: ((query: string) => { matches: boolean }) | null;
};

function readMatchMedia(
  matchMedia: LivingLookup["matchMedia"]
): { matches: boolean } | null {
  if (matchMedia) {
    try {
      return matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      return null;
    }
  }
  if (typeof window === "undefined") return null;
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
  } catch {
    return null;
  }
}

/**
 * Living map (analytic orbital motion + sun corona) — on by default.
 * Opt out via localStorage (`orbit-map-living` = "0") or `?living=0`
 * (which persists the choice); `?living=1` re-enables.
 * Always off when the user prefers reduced motion.
 */
export function getOrbitMapLivingEnabled(lookup: LivingLookup = {}): boolean {
  try {
    if (readMatchMedia(lookup.matchMedia)?.matches) {
      return false;
    }

    const search =
      lookup.search ??
      (typeof window === "undefined" ? "" : window.location.search);
    const storage =
      lookup.storage === undefined
        ? typeof window === "undefined"
          ? null
          : window.localStorage
        : lookup.storage;

    const param = new URLSearchParams(search).get("living");
    if (param === "1" || param === "0") {
      storage?.setItem(ORBIT_MAP_LIVING_STORAGE_KEY, param);
      return param === "1";
    }

    return storage?.getItem(ORBIT_MAP_LIVING_STORAGE_KEY) !== "0";
  } catch {
    return false;
  }
}

export function prefersOrbitMapReducedMotion(
  matchMedia?: LivingLookup["matchMedia"]
): boolean {
  return Boolean(readMatchMedia(matchMedia)?.matches);
}

export function setOrbitMapLivingEnabled(
  enabled: boolean,
  storage?: Pick<Storage, "setItem"> | null
) {
  const store =
    storage === undefined
      ? typeof window === "undefined"
        ? null
        : window.localStorage
      : storage;
  store?.setItem(ORBIT_MAP_LIVING_STORAGE_KEY, enabled ? "1" : "0");
}
