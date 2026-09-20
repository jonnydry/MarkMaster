// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  ORBIT_SCAN_SNAPSHOT_MAX_CHARS,
  ORBIT_SCAN_SNAPSHOT_VERSION,
  buildOrbitScanSnapshotRaw,
  clearOrbitScanSnapshot,
  loadOrbitScanSnapshot,
  orbitScanSnapshotStorageKey,
  parseOrbitScanSnapshotInput,
  parseOrbitScanSnapshotRaw,
  saveOrbitScanSnapshot,
} from "@/lib/orbit-scan-snapshot";
import type {
  BookmarkWithRelations,
  OrbitScanResponsePayload,
} from "@/types";

function scanPayload(
  overrides: Partial<OrbitScanResponsePayload> = {}
): OrbitScanResponsePayload {
  return {
    scanRunId: "run-1",
    model: "grok-4-fast",
    scannedAt: "2026-09-19T00:00:00.000Z",
    privacy: { storeDisabled: true, zeroDataRetention: null },
    batch: {
      mode: "auto",
      profile: "balanced",
      requestedCount: 2,
      candidatePoolCount: 10,
      sharedSignalCount: 1,
      sourceUnknownCount: 0,
      sourceUnknownRate: 0,
      selectedSourceUnknownCount: 0,
      selectedSourceUnknownRate: 0,
      usefulSignalCount: 2,
      selectionReason: "test",
    },
    plan: {
      overview: {
        summary: "Two bookmarks about testing",
        taggingStrategy: "reuse",
        collectionStrategy: "reuse",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "high",
          reasoning: "clear match",
          tags: [
            { name: "testing", color: "#fff", reason: "topic", reuseExisting: true },
          ],
          collection: null,
        },
        {
          bookmarkId: "b2",
          confidence: "low",
          reasoning: "sparse",
          tags: [],
          collection: {
            name: "Dev",
            description: "dev stuff",
            reason: "topic",
            reuseExisting: true,
          },
        },
      ],
    },
    summary: {
      bookmarkCount: 2,
      bookmarksWithTags: 1,
      bookmarksWithCollections: 1,
      tagAssignments: 1,
      uniqueTags: 1,
      collectionBuckets: 1,
      reusedExistingTags: 1,
      reusedExistingCollections: 1,
      newCollectionBuckets: 0,
    },
    tagRollups: [
      { name: "testing", color: "#fff", count: 1, reuseExisting: true },
    ],
    collectionRollups: [],
    ...overrides,
  };
}

const USER_ID = "user-1";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("buildOrbitScanSnapshotRaw / parseOrbitScanSnapshotRaw", () => {
  it("round-trips the plan and review progress", () => {
    const raw = buildOrbitScanSnapshotRaw({
      userId: USER_ID,
      payload: scanPayload(),
      dismissedBookmarkIds: new Set(["b2"]),
      appliedBookmarkIds: ["b1"],
      scanContextKey: "ctx-recent-1",
    });
    expect(raw).not.toBeNull();

    const snapshot = parseOrbitScanSnapshotRaw(raw!, USER_ID);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.version).toBe(ORBIT_SCAN_SNAPSHOT_VERSION);
    expect(snapshot!.payload.scanRunId).toBe("run-1");
    expect(snapshot!.payload.plan.suggestions).toHaveLength(2);
    expect(snapshot!.payload.plan.suggestions[0].tags[0].name).toBe("testing");
    expect(snapshot!.dismissedBookmarkIds).toEqual(["b2"]);
    expect(snapshot!.appliedBookmarkIds).toEqual(["b1"]);
    expect(snapshot!.scanContextKey).toBe("ctx-recent-1");
  });

  it("strips full bookmark rows from the persisted payload", () => {
    const raw = buildOrbitScanSnapshotRaw({
      userId: USER_ID,
      payload: scanPayload({
        scannedBookmarks: [
          { id: "b1", tweetText: "big body" } as unknown as BookmarkWithRelations,
        ],
      }),
      dismissedBookmarkIds: [],
      appliedBookmarkIds: [],
    });

    expect(raw).not.toBeNull();
    expect(raw!).not.toContain("scannedBookmarks");
    const snapshot = parseOrbitScanSnapshotRaw(raw!, USER_ID);
    expect(snapshot!.payload.scannedBookmarks).toBeUndefined();
  });

  it("returns null instead of persisting oversized plans", () => {
    const raw = buildOrbitScanSnapshotRaw({
      userId: USER_ID,
      payload: scanPayload({
        plan: {
          overview: {
            summary: "x".repeat(ORBIT_SCAN_SNAPSHOT_MAX_CHARS + 1),
            taggingStrategy: "",
            collectionStrategy: "",
          },
          suggestions: [],
        },
      }),
      dismissedBookmarkIds: [],
      appliedBookmarkIds: [],
    });

    expect(raw).toBeNull();
  });

  it("rejects corrupt JSON", () => {
    expect(parseOrbitScanSnapshotRaw("{not json", USER_ID)).toBeNull();
  });

  it("rejects stale schema versions", () => {
    const raw = buildOrbitScanSnapshotRaw({
      userId: USER_ID,
      payload: scanPayload(),
      dismissedBookmarkIds: [],
      appliedBookmarkIds: [],
    })!;
    const stale = JSON.stringify({
      ...JSON.parse(raw),
      version: ORBIT_SCAN_SNAPSHOT_VERSION + 1,
    });

    expect(parseOrbitScanSnapshotRaw(stale, USER_ID)).toBeNull();
  });

  it("rejects shape mismatches inside the plan", () => {
    const raw = buildOrbitScanSnapshotRaw({
      userId: USER_ID,
      payload: scanPayload(),
      dismissedBookmarkIds: [],
      appliedBookmarkIds: [],
    })!;
    const parsed = JSON.parse(raw);
    parsed.payload.plan.suggestions[0].confidence = "certain"; // not a valid enum
    expect(parseOrbitScanSnapshotRaw(JSON.stringify(parsed), USER_ID)).toBeNull();

    const parsedMissing = JSON.parse(raw);
    delete parsedMissing.payload.plan;
    expect(
      parseOrbitScanSnapshotRaw(JSON.stringify(parsedMissing), USER_ID)
    ).toBeNull();
  });

  it("rejects snapshots saved for a different user", () => {
    const raw = buildOrbitScanSnapshotRaw({
      userId: "someone-else",
      payload: scanPayload(),
      dismissedBookmarkIds: [],
      appliedBookmarkIds: [],
    })!;

    expect(parseOrbitScanSnapshotRaw(raw, USER_ID)).toBeNull();
  });
});

describe("sessionStorage round-trip", () => {
  it("saves, loads, and clears a snapshot", () => {
    saveOrbitScanSnapshot({
      userId: USER_ID,
      payload: scanPayload(),
      dismissedBookmarkIds: ["b2"],
      appliedBookmarkIds: [],
    });

    const loaded = loadOrbitScanSnapshot(USER_ID);
    expect(loaded).not.toBeNull();
    expect(loaded!.payload.scanRunId).toBe("run-1");
    expect(loaded!.dismissedBookmarkIds).toEqual(["b2"]);

    clearOrbitScanSnapshot(USER_ID);
    expect(loadOrbitScanSnapshot(USER_ID)).toBeNull();
  });

  it("drops and removes corrupt stored snapshots on load", () => {
    window.sessionStorage.setItem(
      orbitScanSnapshotStorageKey(USER_ID),
      "{corrupt"
    );

    expect(loadOrbitScanSnapshot(USER_ID)).toBeNull();
    expect(
      window.sessionStorage.getItem(orbitScanSnapshotStorageKey(USER_ID))
    ).toBeNull();
  });

  it("keeps snapshots isolated per user", () => {
    saveOrbitScanSnapshot({
      userId: USER_ID,
      payload: scanPayload(),
      dismissedBookmarkIds: [],
      appliedBookmarkIds: [],
    });

    expect(loadOrbitScanSnapshot("user-2")).toBeNull();
    expect(loadOrbitScanSnapshot(USER_ID)).not.toBeNull();
  });
});

describe("parseOrbitScanSnapshotInput", () => {
  it("accepts a PUT body and stamps the authenticated user", () => {
    const result = parseOrbitScanSnapshotInput(
      {
        payload: scanPayload(),
        dismissedBookmarkIds: ["b2"],
        appliedBookmarkIds: ["b1"],
      },
      USER_ID,
      new Date("2026-09-20T00:00:00.000Z")
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.userId).toBe(USER_ID);
    expect(result.snapshot.dismissedBookmarkIds).toEqual(["b2"]);
    expect(result.snapshot.appliedBookmarkIds).toEqual(["b1"]);
    expect(result.snapshot.savedAt).toBe("2026-09-20T00:00:00.000Z");
  });

  it("rejects missing payloads and non-string id lists", () => {
    expect(parseOrbitScanSnapshotInput({}, USER_ID).ok).toBe(false);
    expect(
      parseOrbitScanSnapshotInput(
        { payload: scanPayload(), dismissedBookmarkIds: [1] },
        USER_ID
      )
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses oversized plans", () => {
    const result = parseOrbitScanSnapshotInput(
      {
        payload: scanPayload({
          plan: {
            overview: {
              summary: "x".repeat(ORBIT_SCAN_SNAPSHOT_MAX_CHARS + 1),
              taggingStrategy: "",
              collectionStrategy: "",
            },
            suggestions: [],
          },
        }),
      },
      USER_ID
    );

    expect(result).toEqual({ ok: false, reason: "too_large" });
  });
});
