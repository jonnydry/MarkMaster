// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";

import { useOrbitFlywheelScan } from "@/hooks/use-orbit-flywheel-scan";
import { renderOrbitHook } from "@/test/hooks/orbit-test-harness";

const mocks = vi.hoisted(() => ({
  trackFlywheelEvent: vi.fn(),
}));

vi.mock("@/lib/flywheel", () => ({
  trackFlywheelEvent: mocks.trackFlywheelEvent,
}));

function buildScanRequest(targetIds: string[], scanSelection: boolean) {
  return {
    targetIds,
    scanSelection,
    contextKey: "ctx",
    batch: undefined,
  };
}

describe("useOrbitFlywheelScan", () => {
  it("auto-scans digest ids once and opens review on success", async () => {
    const runOrbitScan = vi.fn().mockResolvedValue({
      plan: { suggestions: [] },
    });
    const setReviewSession = vi.fn();
    const router = { replace: vi.fn() };
    const params = new URLSearchParams({ digestIds: "b1,b2", source: "digest" });

    renderOrbitHook(() =>
      useOrbitFlywheelScan({
        router: router as never,
        searchParams: params as never,
        highlightIdFromUrl: null,
        digestIdsFromUrl: "b1,b2",
        sourceFromUrl: "digest",
        scanning: false,
        buildScanRequest,
        runOrbitScan,
        setReviewSession,
      })
    );

    await waitFor(() => {
      expect(runOrbitScan).toHaveBeenCalledTimes(1);
    });

    expect(mocks.trackFlywheelEvent).toHaveBeenCalledWith(
      "digest.session_start",
      { size: 2, source: "digest" }
    );
    expect(setReviewSession).toHaveBeenCalled();
  });

  it("skips highlight auto-scan while digest ids are present", async () => {
    const runOrbitScan = vi.fn().mockResolvedValue({ plan: { suggestions: [] } });
    const setReviewSession = vi.fn();
    const router = { replace: vi.fn() };
    const params = new URLSearchParams({
      digestIds: "b1",
      highlightId: "b2",
    });

    renderOrbitHook(() =>
      useOrbitFlywheelScan({
        router: router as never,
        searchParams: params as never,
        highlightIdFromUrl: "b2",
        digestIdsFromUrl: "b1",
        sourceFromUrl: null,
        scanning: false,
        buildScanRequest,
        runOrbitScan,
        setReviewSession,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(runOrbitScan).toHaveBeenCalledTimes(1);
    expect(runOrbitScan.mock.calls[0]?.[0]?.targetIds).toEqual(["b1"]);
  });
});
