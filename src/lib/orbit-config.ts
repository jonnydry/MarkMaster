export const ORBIT_SCAN_BATCH_PROFILES = {
  quick: {
    id: "quick",
    label: "Quick",
    size: 12,
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    size: 24,
  },
  deep: {
    id: "deep",
    label: "Deep",
    size: 36,
  },
} as const;

export type OrbitScanBatchProfileId = keyof typeof ORBIT_SCAN_BATCH_PROFILES;
export type OrbitScanBatchMode = "auto" | OrbitScanBatchProfileId;

/** Candidate pool size for adaptive scans before the final Grok batch is selected. */
export const ORBIT_SCAN_CANDIDATE_POOL_SIZE = 100;

/** Upper bound for bookmarks sent to xAI per Orbit scan (prompt size + API limits). */
export const ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN =
  ORBIT_SCAN_BATCH_PROFILES.deep.size;
