// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchRemote = vi.hoisted(() => vi.fn());
const saveRemote = vi.hoisted(() => vi.fn());
const clearRemote = vi.hoisted(() => vi.fn());

vi.mock("@/lib/orbit-scan-snapshot-client", () => ({
  fetchOrbitScanSnapshotFromServer: fetchRemote,
  saveOrbitScanSnapshotToServer: saveRemote,
  clearOrbitScanSnapshotOnServer: clearRemote,
}));

import {
  loadOrbitScanSnapshot,
  saveOrbitScanSnapshot,
} from "@/lib/orbit-scan-snapshot";
import { useOrbitScanSnapshotSync } from "@/hooks/use-orbit-scan-snapshot-sync";
import type { OrbitScanResponsePayload } from "@/types";

function scanPayload(): OrbitScanResponsePayload {
  return {
    scanRunId: "run-1",
    model: "grok-4-fast",
    scannedAt: "2026-09-19T00:00:00.000Z",
    privacy: { storeDisabled: true, zeroDataRetention: null },
    batch: {
      mode: "auto",
      profile: "balanced",
      requestedCount: 1,
      candidatePoolCount: 4,
      sharedSignalCount: 0,
      sourceUnknownCount: 0,
      sourceUnknownRate: 0,
      selectedSourceUnknownCount: 0,
      selectedSourceUnknownRate: 0,
      usefulSignalCount: 1,
      selectionReason: "test",
    },
    plan: {
      overview: {
        summary: "One bookmark",
        taggingStrategy: "reuse",
        collectionStrategy: "reuse",
      },
      suggestions: [
        {
          bookmarkId: "b1",
          confidence: "high",
          reasoning: "clear",
          tags: [
            { name: "testing", color: "#fff", reason: "topic", reuseExisting: true },
          ],
          collection: null,
        },
      ],
    },
    summary: { bookmarkCount: 1 },
    tagRollups: [],
    collectionRollups: [],
  };
}

describe("useOrbitScanSnapshotSync", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
    fetchRemote.mockResolvedValue(null);
    saveRemote.mockResolvedValue(undefined);
    clearRemote.mockResolvedValue(undefined);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("restores from sessionStorage without hitting the server", async () => {
    saveOrbitScanSnapshot({
      userId: "user-1",
      payload: scanPayload(),
      dismissedBookmarkIds: ["b2"],
      appliedBookmarkIds: ["b1"],
      scanContextKey: "ctx-saved",
    });

    const restoreScanSnapshot = vi.fn();
    const restoreScanContext = vi.fn();
    const setAppliedBookmarkIds = vi.fn();

    renderHook(() =>
      useOrbitScanSnapshotSync({
        userId: "user-1",
        plan: null,
        scanning: false,
        dismissedBookmarkIds: [],
        appliedBookmarkIds: [],
        restoreScanSnapshot,
        restoreScanContext,
        scanContextKey: "ctx-1",
        setAppliedBookmarkIds,
      })
    );

    expect(restoreScanSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ scanRunId: "run-1" }),
      ["b2"]
    );
    expect(restoreScanContext).toHaveBeenCalledWith("ctx-saved");
    expect(setAppliedBookmarkIds).toHaveBeenCalledWith(new Set(["b1"]));
    expect(fetchRemote).not.toHaveBeenCalled();
    expect(clearRemote).not.toHaveBeenCalled();
    expect(loadOrbitScanSnapshot("user-1")).not.toBeNull();
  });

  it("does not delete the server row when GET fails and there is no plan", async () => {
    fetchRemote.mockRejectedValue(new Error("offline"));

    renderHook(() =>
      useOrbitScanSnapshotSync({
        userId: "user-1",
        plan: null,
        scanning: false,
        dismissedBookmarkIds: [],
        appliedBookmarkIds: [],
        restoreScanSnapshot: vi.fn(),
        restoreScanContext: vi.fn(),
        scanContextKey: "ctx-1",
        setAppliedBookmarkIds: vi.fn(),
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(clearRemote).not.toHaveBeenCalled();
  });

  it("debounces remote saves and clears immediately when the plan is gone", async () => {
    const payload = scanPayload();
    const { rerender } = renderHook(
      (props: { plan: OrbitScanResponsePayload | null }) =>
        useOrbitScanSnapshotSync({
          userId: "user-1",
          plan: props.plan,
          scanning: false,
          dismissedBookmarkIds: [],
          appliedBookmarkIds: [],
          restoreScanSnapshot: vi.fn(),
          restoreScanContext: vi.fn(),
          scanContextKey: "ctx-1",
          setAppliedBookmarkIds: vi.fn(),
        }),
      { initialProps: { plan: payload } }
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(saveRemote).not.toHaveBeenCalled();
    expect(loadOrbitScanSnapshot("user-1")).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(saveRemote).toHaveBeenCalledTimes(1);

    rerender({ plan: null });
    await act(async () => {
      await Promise.resolve();
    });

    expect(loadOrbitScanSnapshot("user-1")).toBeNull();
    expect(clearRemote).toHaveBeenCalledTimes(1);
  });
});
