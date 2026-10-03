// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { useBookmarkActions } from "@/hooks/use-bookmark-actions";
import { buildOrbitMapGraphIndexes } from "@/lib/orbit-map-graph-indexes";
import type { OrbitGraphPayload } from "@/types";

const toastSuccess = vi.hoisted(() => vi.fn());
const sendJson = vi.hoisted(() => vi.fn());
const patchOrbitGraphAssignment = vi.hoisted(() => vi.fn());

vi.mock("@/lib/toast", () => ({
  toast: {
    success: toastSuccess,
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/fetch-json", () => ({
  sendJson,
}));

vi.mock("@/lib/orbit-graph-assign", () => ({
  patchOrbitGraphAssignment,
}));

import { useOrbitMapAssignments } from "@/hooks/use-orbit-map-assignments";

const graph: OrbitGraphPayload = {
  nodes: [
    {
      kind: "collection",
      id: "collection-1",
      name: "Reading",
      variant: "user_collection",
      count: 0,
    },
  ],
  edges: [],
  stats: {
    totalBookmarks: 0,
    affiliatedBookmarks: 0,
    looseBookmarks: 0,
    renderedBookmarks: 0,
    truncatedBookmarks: 0,
    tagCount: 0,
    userCollectionCount: 1,
    xFolderCount: 0,
  },
  generatedAt: "2026-01-01T00:00:00.000Z",
  nodeCap: 1000,
  scope: "library",
};

describe("collection undo", () => {
  it("uses the remove-from-collection mutation instead of an inline delete", async () => {
    const handleAddToCollection = vi.fn(async () => undefined);
    const handleRemoveFromCollection = vi.fn(async () => undefined);
    const actions = {
      handleAddToCollection,
      handleRemoveFromCollection,
      handleAddTag: vi.fn(),
      handleRemoveTag: vi.fn(),
    } as unknown as ReturnType<typeof useBookmarkActions>;

    const { result } = renderHook(() =>
      useOrbitMapAssignments({
        actions,
        dialogs: {} as never,
        queryClient: new QueryClient(),
        canvasRef: { current: null },
        graphIndexes: buildOrbitMapGraphIndexes(graph),
        connectionIndex: null,
        activeSelectionNode: null,
        selectedBookmarkId: null,
        armedBookmark: null,
        onSelectionChange: vi.fn(),
      })
    );

    await result.current.handleNodeDropped(
      "bookmark-1",
      "collection-1",
      "collection"
    );

    expect(handleAddToCollection).toHaveBeenCalledWith(
      "bookmark-1",
      "collection-1"
    );
    const options = toastSuccess.mock.calls[0]?.[1] as {
      action: { onClick: () => void };
    };
    options.action.onClick();

    expect(handleRemoveFromCollection).toHaveBeenCalledWith(
      "bookmark-1",
      "collection-1"
    );
    expect(sendJson).not.toHaveBeenCalled();
    expect(patchOrbitGraphAssignment).not.toHaveBeenCalled();
  });
});
