// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendJson } from "@/lib/fetch-json";
import { ORBIT_GRAPH_QUERY_KEY } from "@/lib/query-invalidation";
import type { OrbitGraphPayload } from "@/types";

vi.mock("@/lib/fetch-json", () => ({
  sendJson: vi.fn(async () => undefined),
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { useBookmarkActions } from "@/hooks/use-bookmark-actions";

function libraryGraph(
  edges: OrbitGraphPayload["edges"]
): OrbitGraphPayload {
  return {
    nodes: [
      {
        kind: "core",
        id: "orbit-index",
        totalBookmarks: 1,
        looseBookmarks: edges.some((edge) => edge.kind === "loose") ? 1 : 0,
      },
      {
        kind: "bookmark",
        id: "bookmark-1",
        title: "Example",
        authorUsername: "user",
        authorDisplayName: "User",
        affiliated: edges.some((edge) => edge.kind === "bookmark-collection"),
        recent: true,
      },
      {
        kind: "collection",
        id: "collection-1",
        name: "Reading",
        variant: "user_collection",
        count: edges.some((edge) => edge.kind === "bookmark-collection") ? 1 : 0,
      },
    ],
    edges,
    stats: {
      totalBookmarks: 1,
      affiliatedBookmarks: edges.some((edge) => edge.kind === "bookmark-collection")
        ? 1
        : 0,
      looseBookmarks: edges.some((edge) => edge.kind === "loose") ? 1 : 0,
      renderedBookmarks: 1,
      truncatedBookmarks: 0,
      tagCount: 0,
      userCollectionCount: 1,
      xFolderCount: 0,
    },
    generatedAt: "2026-01-01T00:00:00.000Z",
    nodeCap: 1000,
    scope: "library",
  };
}

const graphKey = [...ORBIT_GRAPH_QUERY_KEY, "library", ""] as const;

function renderActions(graph: OrbitGraphPayload) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const queryFn = vi.fn(async () => graph);

  function GraphObserver() {
    useQuery({ queryKey: graphKey, queryFn, staleTime: Infinity });
    return null;
  }

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <GraphObserver />
        {children}
      </QueryClientProvider>
    );
  }

  const hook = renderHook(() => useBookmarkActions(), { wrapper: Wrapper });
  return { ...hook, queryClient, queryFn };
}

describe("handleRemoveFromCollection", () => {
  beforeEach(() => {
    vi.mocked(sendJson).mockClear();
  });

  it("deletes through the settled mutation and patches the graph without refetching", async () => {
    const graph = libraryGraph([
      {
        kind: "bookmark-collection",
        bookmarkId: "bookmark-1",
        collectionId: "collection-1",
      },
    ]);
    const { result, queryClient, queryFn } = renderActions(graph);
    await waitFor(() => expect(queryFn).toHaveBeenCalledOnce());

    await result.current.handleRemoveFromCollection("bookmark-1", "collection-1");

    expect(sendJson).toHaveBeenCalledWith("/api/collections/collection-1/items", {
      method: "DELETE",
      body: { bookmarkIds: ["bookmark-1"] },
    });
    expect(
      queryClient
        .getQueryData<OrbitGraphPayload>(graphKey)
        ?.edges.some((edge) => edge.kind === "bookmark-collection")
    ).toBe(false);
    expect(queryFn).toHaveBeenCalledOnce();
    expect(queryClient.getQueryState(graphKey)?.isInvalidated).toBe(true);
  });

  it("refetches when the cached graph already matches the removal", async () => {
    const graph = libraryGraph([{ kind: "loose", bookmarkId: "bookmark-1" }]);
    const { result, queryFn } = renderActions(graph);
    await waitFor(() => expect(queryFn).toHaveBeenCalledOnce());

    await result.current.handleRemoveFromCollection("bookmark-1", "collection-1");

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
  });
});
