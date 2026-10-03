// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { Activity, createElement, type ReactNode } from "react";
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

  it("sends no DELETE while the server is known to hold no snapshot", async () => {
    const { rerender } = renderHook(
      (props: { scanContextKey: string }) =>
        useOrbitScanSnapshotSync({
          userId: "user-1",
          plan: null,
          scanning: false,
          dismissedBookmarkIds: [],
          appliedBookmarkIds: [],
          restoreScanSnapshot: vi.fn(),
          restoreScanContext: vi.fn(),
          scanContextKey: props.scanContextKey,
          setAppliedBookmarkIds: vi.fn(),
        }),
      { initialProps: { scanContextKey: "ctx-1" } }
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchRemote).toHaveBeenCalledOnce();

    // Paging the queue / typing a search changes the scan context.
    rerender({ scanContextKey: "ctx-2" });
    rerender({ scanContextKey: "ctx-3" });
    await act(async () => {
      await Promise.resolve();
    });

    expect(clearRemote).not.toHaveBeenCalled();
  });

  it("clears the server row once, not on every later context change", async () => {
    const payload = scanPayload();
    const { rerender } = renderHook(
      (props: { plan: OrbitScanResponsePayload | null; scanContextKey: string }) =>
        useOrbitScanSnapshotSync({
          userId: "user-1",
          plan: props.plan,
          scanning: false,
          dismissedBookmarkIds: [],
          appliedBookmarkIds: [],
          restoreScanSnapshot: vi.fn(),
          restoreScanContext: vi.fn(),
          scanContextKey: props.scanContextKey,
          setAppliedBookmarkIds: vi.fn(),
        }),
      { initialProps: { plan: payload, scanContextKey: "ctx-1" } }
    );
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(saveRemote).toHaveBeenCalledTimes(1);

    rerender({ plan: null, scanContextKey: "ctx-1" });
    rerender({ plan: null, scanContextKey: "ctx-2" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(clearRemote).toHaveBeenCalledTimes(1);

    // A new plan makes the next clear real again.
    rerender({ plan: payload, scanContextKey: "ctx-2" });
    rerender({ plan: null, scanContextKey: "ctx-2" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(clearRemote).toHaveBeenCalledTimes(2);
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

  it("sends a DELETE only after an in-flight save has finished", async () => {
    let finishSave!: () => void;
    saveRemote.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishSave = resolve))
    );
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
      vi.advanceTimersByTime(600);
    });
    expect(saveRemote).toHaveBeenCalledTimes(1);

    rerender({ plan: null });
    await act(async () => {
      await Promise.resolve();
    });
    expect(clearRemote).not.toHaveBeenCalled();

    await act(async () => {
      finishSave();
      await Promise.resolve();
    });
    expect(clearRemote).toHaveBeenCalledTimes(1);
  });

  describe("inside a kept page (Activity)", () => {
    function renderInActivity(payload: OrbitScanResponsePayload) {
      const page = { mode: "visible" as "visible" | "hidden" };
      const view = renderHook(
        () =>
          useOrbitScanSnapshotSync({
            userId: "user-1",
            plan: payload,
            scanning: false,
            dismissedBookmarkIds: EMPTY,
            appliedBookmarkIds: EMPTY,
            restoreScanSnapshot: vi.fn(),
            restoreScanContext: vi.fn(),
            scanContextKey: "ctx-1",
            setAppliedBookmarkIds: vi.fn(),
          }),
        {
          wrapper: ({ children }: { children: ReactNode }) =>
            createElement(Activity, { mode: page.mode }, children),
        }
      );
      const show = (mode: "visible" | "hidden") => {
        page.mode = mode;
        view.rerender();
      };
      return { show };
    }
    const EMPTY: string[] = [];

    it("saves a pending change right away when the page is hidden mid-debounce", async () => {
      const { show } = renderInActivity(scanPayload());

      show("hidden");
      await act(async () => {
        await Promise.resolve();
      });
      expect(saveRemote).toHaveBeenCalledTimes(1);

      show("visible");
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      // Showing the page again with the same plan saves nothing new.
      expect(saveRemote).toHaveBeenCalledTimes(1);
    });

    it("does not re-save an unchanged plan each time the page is shown", async () => {
      const { show } = renderInActivity(scanPayload());
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      expect(saveRemote).toHaveBeenCalledTimes(1);

      show("hidden");
      show("visible");
      await act(async () => {
        vi.advanceTimersByTime(600);
      });

      expect(saveRemote).toHaveBeenCalledTimes(1);
      expect(clearRemote).not.toHaveBeenCalled();
    });
  });
});
