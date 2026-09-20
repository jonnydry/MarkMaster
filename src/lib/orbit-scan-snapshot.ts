import * as v from "valibot";

import type { OrbitScanResponsePayload } from "@/types";

/**
 * Interim persistence for the active Orbit scan plan (UX-H1).
 *
 * A paid Grok/Jev scan used to live only in React state, so any navigation
 * silently discarded it. Until a real pending-suggestions table exists, the
 * trimmed plan (suggestions + batch metadata, never full bookmark bodies) and
 * review progress are mirrored into sessionStorage keyed per user, and
 * rehydrated when the Orbit page mounts. Bookmark bodies are recovered from
 * the queue / scan-candidates queries the page already fetches.
 */
export const ORBIT_SCAN_SNAPSHOT_VERSION = 1;

/**
 * Refuse to persist snapshots above this many UTF-16 code units (~800KB of
 * the ~5MB sessionStorage quota). A trimmed plan is normally a few tens of KB;
 * anything larger is safer to drop than to risk quota errors for other keys.
 */
export const ORBIT_SCAN_SNAPSHOT_MAX_CHARS = 400_000;

const confidenceSchema = v.picklist(["high", "medium", "low"]);

const tagSuggestionSchema = v.object({
  name: v.string(),
  color: v.string(),
  reason: v.string(),
  reuseExisting: v.boolean(),
});

const collectionSuggestionSchema = v.object({
  name: v.string(),
  description: v.string(),
  reason: v.string(),
  reuseExisting: v.boolean(),
});

const suggestionSchema = v.object({
  bookmarkId: v.string(),
  confidence: confidenceSchema,
  reasoning: v.string(),
  tags: v.array(tagSuggestionSchema),
  collection: v.nullable(collectionSuggestionSchema),
});

// Loose on nested detail fields (enrichment, hybrid metrics, rollups) so
// additive backend changes don't invalidate stored snapshots; the version
// literal below still drops genuinely incompatible shapes.
const scanPayloadSchema = v.looseObject({
  scanRunId: v.string(),
  model: v.string(),
  scannedAt: v.string(),
  privacy: v.looseObject({
    storeDisabled: v.boolean(),
    zeroDataRetention: v.nullable(v.boolean()),
  }),
  batch: v.looseObject({
    mode: v.picklist(["auto", "quick", "balanced", "deep", "sweep"]),
    profile: v.picklist(["quick", "balanced", "deep", "sweep"]),
    requestedCount: v.number(),
    candidatePoolCount: v.number(),
    selectionReason: v.string(),
  }),
  plan: v.object({
    overview: v.looseObject({
      summary: v.string(),
      taggingStrategy: v.string(),
      collectionStrategy: v.string(),
    }),
    suggestions: v.array(suggestionSchema),
  }),
  summary: v.looseObject({ bookmarkCount: v.number() }),
  tagRollups: v.array(v.looseObject({ name: v.string() })),
  collectionRollups: v.array(v.looseObject({ name: v.string() })),
}) as unknown as v.GenericSchema<unknown, OrbitScanResponsePayload>;

const snapshotSchema = v.object({
  version: v.literal(ORBIT_SCAN_SNAPSHOT_VERSION),
  userId: v.string(),
  savedAt: v.string(),
  payload: scanPayloadSchema,
  dismissedBookmarkIds: v.array(v.string()),
  appliedBookmarkIds: v.array(v.string()),
});

export interface OrbitScanSnapshot {
  version: typeof ORBIT_SCAN_SNAPSHOT_VERSION;
  userId: string;
  savedAt: string;
  payload: OrbitScanResponsePayload;
  dismissedBookmarkIds: string[];
  appliedBookmarkIds: string[];
}

export function orbitScanSnapshotStorageKey(userId: string): string {
  return `markmaster:orbit:scan-snapshot:v${ORBIT_SCAN_SNAPSHOT_VERSION}:${userId}`;
}

export interface BuildOrbitScanSnapshotArgs {
  userId: string;
  payload: OrbitScanResponsePayload;
  dismissedBookmarkIds: Iterable<string>;
  appliedBookmarkIds: Iterable<string>;
  now?: Date;
}

/**
 * Serialize a snapshot for storage. Returns null when the trimmed snapshot
 * still exceeds the size cap (persist nothing rather than a broken plan).
 * Full bookmark rows (`scannedBookmarks`) are always stripped.
 */
export function buildOrbitScanSnapshotRaw(
  args: BuildOrbitScanSnapshotArgs
): string | null {
  const trimmedPayload: OrbitScanResponsePayload = { ...args.payload };
  delete trimmedPayload.scannedBookmarks;
  const snapshot: OrbitScanSnapshot = {
    version: ORBIT_SCAN_SNAPSHOT_VERSION,
    userId: args.userId,
    savedAt: (args.now ?? new Date()).toISOString(),
    payload: trimmedPayload,
    dismissedBookmarkIds: Array.from(args.dismissedBookmarkIds),
    appliedBookmarkIds: Array.from(args.appliedBookmarkIds),
  };

  const raw = JSON.stringify(snapshot);
  if (raw.length > ORBIT_SCAN_SNAPSHOT_MAX_CHARS) return null;
  return raw;
}

/**
 * Parse a stored snapshot. Returns null for corrupt JSON, stale schema
 * versions, shape mismatches, or a snapshot saved for another user.
 */
export function parseOrbitScanSnapshotRaw(
  raw: string,
  userId: string
): OrbitScanSnapshot | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = v.safeParse(snapshotSchema, json);
  if (!result.success) return null;
  if (result.output.userId !== userId) return null;
  return result.output;
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Storage access can throw in privacy modes / sandboxed frames.
    return null;
  }
}

export function saveOrbitScanSnapshot(args: BuildOrbitScanSnapshotArgs): void {
  const storage = getSessionStorage();
  if (!storage) return;
  const key = orbitScanSnapshotStorageKey(args.userId);
  const raw = buildOrbitScanSnapshotRaw(args);
  try {
    if (raw === null) {
      // Oversized plan: drop any stale snapshot instead of keeping an old one.
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, raw);
  } catch {
    // Quota exceeded / private mode — the plan simply stays memory-only.
  }
}

export function loadOrbitScanSnapshot(userId: string): OrbitScanSnapshot | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  const key = orbitScanSnapshotStorageKey(userId);
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;

  const snapshot = parseOrbitScanSnapshotRaw(raw, userId);
  if (snapshot === null) {
    // Corrupt or stale-shape payloads are removed so they never retry.
    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
  }
  return snapshot;
}

export function clearOrbitScanSnapshot(userId: string): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(orbitScanSnapshotStorageKey(userId));
  } catch {
    // ignore
  }
}
