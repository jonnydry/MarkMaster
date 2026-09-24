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
  sweep: {
    id: "sweep",
    label: "Sweep",
    size: 72,
  },
} as const;

export type OrbitScanBatchProfileId = keyof typeof ORBIT_SCAN_BATCH_PROFILES;
export type OrbitScanBatchMode = "auto" | OrbitScanBatchProfileId;

/** Candidate pool size for adaptive scans before the final batch is selected. */
export const ORBIT_SCAN_CANDIDATE_POOL_SIZE = 160;

/** Upper bound for bookmarks sent to xAI per leftover-escalation call. */
export const ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN =
  ORBIT_SCAN_BATCH_PROFILES.deep.size;

/** Upper bound for a hybrid Jev scan (review overlay still has to be usable). */
export const ORBIT_JEV_MAX_BOOKMARKS_PER_SCAN =
  ORBIT_SCAN_BATCH_PROFILES.sweep.size;

export function getOrbitScanMaxBookmarks(hybrid: boolean) {
  return hybrid
    ? ORBIT_JEV_MAX_BOOKMARKS_PER_SCAN
    : ORBIT_GROK_MAX_BOOKMARKS_PER_SCAN;
}

/** Pre-scan X re-enrichment before Grok (disable with ORBIT_SCAN_ENRICHMENT=false). */
export const ORBIT_SCAN_ENRICHMENT = process.env.ORBIT_SCAN_ENRICHMENT !== "false";

/** Jev may score this many tags per bookmark (priors + matches + proposed). */
export const ORBIT_JEV_MAX_TAG_SHORTLIST = 12;

/** Keep this many lexical overlaps even when Grok proposed a large increment. */
export const ORBIT_JEV_SHORTLIST_LEXICAL_RESERVE = 3;

/** Proposed names may occupy at most this many shortlist slots. */
export const ORBIT_JEV_SHORTLIST_PROPOSED_CAP = 4;

/** Grok may invent this many new tag names per scan batch. */
export const ORBIT_GROK_MAX_PROPOSED_TAGS = 15;

/** Grok may invent this many new collection names per scan batch. */
export const ORBIT_GROK_MAX_PROPOSED_COLLECTIONS = 4;

/** Tags applied to one bookmark from a scan suggestion or a review edit. */
export const ORBIT_MAX_TAGS_PER_BOOKMARK = 5;

/** Include a tag in the Orbit plan when Jev's noul is at least this. */
export const ORBIT_JEV_TAG_INCLUDE_THRESHOLD = 0.55;

/** Treat a tag as a strong match for high-confidence mapping. */
export const ORBIT_JEV_TAG_STRONG_THRESHOLD = 0.8;

/** Flag leftovers for Grok/review when Jev thinks a new label is needed. */
export const ORBIT_JEV_NEEDS_NEW_LABEL_THRESHOLD = 0.7;

/** Accept a collection Choice other than none at or above this confidence. */
export const ORBIT_JEV_COLLECTION_CONFIDENCE_THRESHOLD = 0.6;

function parseBoundedIntEnv(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Parallel Jev requests during a scan (override with ORBIT_JEV_ASSIGN_CONCURRENCY).
 * Default 12 is safe because per-item failures abstain into leftovers instead
 * of rejecting the whole batch (see assignOrbitBookmarksWithJev).
 */
export const ORBIT_JEV_ASSIGN_CONCURRENCY = parseBoundedIntEnv(
  process.env.ORBIT_JEV_ASSIGN_CONCURRENCY,
  12,
  1,
  32
);

/** Tags learned from one untagged library. The assignment list stays this short. */
export const ORBIT_LIBRARY_VOCAB_MAX = 24;

/** Bookmarks read to build a stratified sample. The model only sees the sample. */
export const ORBIT_LIBRARY_SAMPLE_POOL = 240;

/** Posts sent in the one vocabulary call. */
export const ORBIT_LIBRARY_SAMPLE_SIZE = 36;

/** Posts scored together in one Jev call against the closed tag list. */
export const ORBIT_LIBRARY_PACK_SIZE = 6;

/** Packed Jev calls in flight during a library page. */
export const ORBIT_LIBRARY_PACK_CONCURRENCY = 3;

/** Untagged bookmarks processed per library-classify worker page. */
export const ORBIT_LIBRARY_CLASSIFY_PAGE_SIZE = 48;

/** Max worker pages after one user-triggered library classify. */
export const ORBIT_LIBRARY_CLASSIFY_MAX_PAGES = 400;

/** Pages to finish inside one worker invocation before kicking the next. */
export const ORBIT_LIBRARY_CLASSIFY_PAGES_PER_INVOCATION = 4;
