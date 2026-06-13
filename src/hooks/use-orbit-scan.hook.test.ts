// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";

import { useOrbitScan } from "@/hooks/use-orbit-scan";
import { renderOrbitHook } from "@/test/hooks/orbit-test-harness";

const mocks = vi.hoisted(() => ({
  sendJson: vi.fn(),
  invalidateOrbitApplyQueries: vi.fn(),
  trackFlywheelEvent: vi.fn(),
}));

vi.mock("@/lib/fetch-json", () => ({
  sendJson: mocks.sendJson,
  FetchJsonError: class FetchJsonError extends Error {},
}));

vi.mock("@/lib/query-invalidation", () => ({
  invalidateOrbitApplyQueries: mocks.invalidateOrbitApplyQueries,
}));

vi.mock("@/lib/flywheel", () => ({
  trackFlywheelEvent: mocks.trackFlywheelEvent,
}));

describe("useOrbitScan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dismiss hides decisions until toggled back", async () => {
    mocks.sendJson.mockResolvedValueOnce({
      scanRunId: "run-1",
      model: "grok",
      scannedAt: "2026-06-08T00:00:00.000Z",
      privacy: { storeDisabled: true, zeroDataRetention: null },
      batch: {
        mode: "auto",
        profile: "quick",
        requestedCount: 1,
        candidatePoolCount: 1,
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
          summary: "Summary",
          taggingStrategy: "Tags",
          collectionStrategy: "Collections",
        },
        suggestions: [
          {
            bookmarkId: "b1",
            confidence: "high",
            reasoning: "Clear",
            tags: [],
            collection: null,
          },
        ],
      },
      summary: {
        bookmarkCount: 1,
        bookmarksWithTags: 0,
        bookmarksWithCollections: 0,
        tagAssignments: 0,
        uniqueTags: 0,
        collectionBuckets: 0,
        reusedExistingTags: 0,
        reusedExistingCollections: 0,
        newCollectionBuckets: 0,
      },
      tagRollups: [],
      collectionRollups: [],
    });

    const { result } = renderOrbitHook(() => useOrbitScan());

    await act(async () => {
      await result.current.scanNow(["b1"]);
    });

    expect(result.current.getDecision("b1")).not.toBeNull();

    act(() => {
      result.current.dismiss("b1");
    });

    expect(result.current.getDecision("b1")).toBeNull();

    act(() => {
      result.current.toggleDismiss("b1");
    });

    expect(result.current.getDecision("b1")).not.toBeNull();
  });

  it("clearPlan resets scan state", async () => {
    mocks.sendJson.mockResolvedValueOnce({
      scanRunId: "run-1",
      model: "grok",
      scannedAt: "2026-06-08T00:00:00.000Z",
      privacy: { storeDisabled: true, zeroDataRetention: null },
      batch: {
        mode: "auto",
        profile: "quick",
        requestedCount: 1,
        candidatePoolCount: 1,
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
          summary: "Summary",
          taggingStrategy: "Tags",
          collectionStrategy: "Collections",
        },
        suggestions: [
          {
            bookmarkId: "b1",
            confidence: "high",
            reasoning: "Clear",
            tags: [],
            collection: null,
          },
        ],
      },
      summary: {
        bookmarkCount: 1,
        bookmarksWithTags: 0,
        bookmarksWithCollections: 0,
        tagAssignments: 0,
        uniqueTags: 0,
        collectionBuckets: 0,
        reusedExistingTags: 0,
        reusedExistingCollections: 0,
        newCollectionBuckets: 0,
      },
      tagRollups: [],
      collectionRollups: [],
    });

    const { result } = renderOrbitHook(() => useOrbitScan());

    await act(async () => {
      await result.current.scanNow(["b1"]);
    });

    expect(result.current.plan).not.toBeNull();

    act(() => {
      result.current.clearPlan();
    });

    expect(result.current.plan).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.dismissedBookmarkIds.size).toBe(0);
  });

  it("scanNow rejects empty bookmark id lists", async () => {
    const { result } = renderOrbitHook(() => useOrbitScan());

    await act(async () => {
      const payload = await result.current.scanNow([]);
      expect(payload).toBeNull();
    });

    expect(mocks.sendJson).not.toHaveBeenCalled();
  });
});

describe("useOrbitScan scanning flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets scanning while scanNow is in flight", async () => {
    let resolveScan!: (value: unknown) => void;
    mocks.sendJson.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScan = resolve;
        })
    );

    const { result } = renderOrbitHook(() => useOrbitScan());

    act(() => {
      void result.current.scanNow(["b1"]);
    });

    await waitFor(() => {
      expect(result.current.scanning).toBe(true);
    });

    await act(async () => {
      resolveScan({
        scanRunId: "run-1",
        model: "grok",
        scannedAt: "2026-06-08T00:00:00.000Z",
        privacy: { storeDisabled: true, zeroDataRetention: null },
        batch: {
          mode: "auto",
          profile: "quick",
          requestedCount: 1,
          candidatePoolCount: 1,
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
            summary: "Summary",
            taggingStrategy: "Tags",
            collectionStrategy: "Collections",
          },
          suggestions: [],
        },
        summary: {
          bookmarkCount: 0,
          bookmarksWithTags: 0,
          bookmarksWithCollections: 0,
          tagAssignments: 0,
          uniqueTags: 0,
          collectionBuckets: 0,
          reusedExistingTags: 0,
          reusedExistingCollections: 0,
          newCollectionBuckets: 0,
        },
        tagRollups: [],
        collectionRollups: [],
      });
    });

    expect(result.current.scanning).toBe(false);
  });
});
