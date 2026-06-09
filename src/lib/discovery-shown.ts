const STORAGE_KEY = "markmaster:discovery-shown-ids";
const MAX_IDS = 30;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ShownStore = {
  ids: string[];
  updatedAt: number;
};

function readStore(): ShownStore {
  if (typeof window === "undefined") {
    return { ids: [], updatedAt: 0 };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ids: [], updatedAt: Date.now() };
    const parsed = JSON.parse(raw) as ShownStore;
    if (!parsed || !Array.isArray(parsed.ids)) {
      return { ids: [], updatedAt: Date.now() };
    }
    return parsed;
  } catch {
    return { ids: [], updatedAt: Date.now() };
  }
}

function writeStore(store: ShownStore) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent("markmaster:discovery-shown-changed"));
  } catch {
    // quota / private mode — graceful no-op
  }
}

function pruneStore(store: ShownStore): ShownStore {
  const now = Date.now();
  if (now - store.updatedAt > TTL_MS) {
    return { ids: [], updatedAt: now };
  }
  return {
    ids: store.ids.slice(-MAX_IDS),
    updatedAt: store.updatedAt,
  };
}

/** Bookmark IDs recently shown in Discovery (7-day TTL, capped at 30). */
export function getDiscoveryShownIds(): string[] {
  return pruneStore(readStore()).ids;
}

export function addDiscoveryShownIds(ids: string[]) {
  if (ids.length === 0) return;
  const store = pruneStore(readStore());
  const seen = new Set(store.ids);
  const next = [...store.ids];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      next.push(id);
    }
  }
  writeStore({
    ids: next.slice(-MAX_IDS),
    updatedAt: Date.now(),
  });
}

/** ISO date (yyyy-mm-dd) for stable daily rotation. */
export function getDailyRotationSeed(): string {
  return new Date().toISOString().slice(0, 10);
}

function hashString(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h || 1;
}

/** Deterministic Fisher–Yates shuffle — same seed yields same order. */
export function shuffleWithSeed<T>(items: T[], seed: string): T[] {
  const arr = [...items];
  let h = hashString(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const j = h % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
