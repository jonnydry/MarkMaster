import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import {
  invalidateBookmarkCollectionSideEffects,
  invalidateBookmarkDeletionSideEffects,
  invalidateBookmarkNoteSideEffects,
  invalidateBookmarkTagSideEffects,
  invalidateCollectionMetadataQueries,
  invalidateOrbitApplyQueries,
  ORBIT_GRAPH_QUERY_KEY,
  ORBIT_SCAN_CANDIDATES_QUERY_KEY,
} from "./query-invalidation";

describe("query invalidation helpers", () => {
  it("invalidates tag side effects without bookmark list refetch", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();

    await invalidateBookmarkTagSideEffects(queryClient);

    const keys = invalidateSpy.mock.calls.map(([args]) => args.queryKey);
    expect(keys).toContainEqual(["tags"]);
    expect(keys).toContainEqual(["collection"]);
    expect(keys).toContainEqual(ORBIT_GRAPH_QUERY_KEY);
    expect(keys.some((key) => key?.[0] === "bookmarks")).toBe(false);
  });

  it("only marks the orbit graph stale when the caller already patched it", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();

    await invalidateBookmarkTagSideEffects(queryClient, { graphRefetch: "none" });
    await invalidateBookmarkCollectionSideEffects(queryClient, "collection-1", {
      graphRefetch: "none",
    });

    const graphCalls = invalidateSpy.mock.calls.filter(
      ([args]) => args.queryKey === ORBIT_GRAPH_QUERY_KEY
    );
    expect(graphCalls).toHaveLength(2);
    for (const [args] of graphCalls) {
      expect(args.refetchType).toBe("none");
    }
    // Sidebar data still refreshes: counts change with the assignment.
    const keys = invalidateSpy.mock.calls.map(([args]) => args.queryKey);
    expect(keys).toContainEqual(["tags"]);
    expect(keys).toContainEqual(["collections"]);
  });

  it("refetches the orbit graph by default", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();

    await invalidateBookmarkTagSideEffects(queryClient);

    const graphCall = invalidateSpy.mock.calls.find(
      ([args]) => args.queryKey === ORBIT_GRAPH_QUERY_KEY
    );
    expect(graphCall?.[0].refetchType).toBe("active");
  });

  it("invalidates note side effects for collection rows and analytics only", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();

    await invalidateBookmarkNoteSideEffects(queryClient);

    const keys = invalidateSpy.mock.calls.map(([args]) => args.queryKey);
    expect(keys).toContainEqual(["collection"]);
    expect(keys).toContainEqual(["analytics"]);
    expect(keys.some((key) => key?.[0] === "bookmarks")).toBe(false);
  });

  it("invalidates deletion side effects without bookmark list refetch", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();

    await invalidateBookmarkDeletionSideEffects(queryClient);

    const keys = invalidateSpy.mock.calls.map(([args]) => args.queryKey);
    expect(keys).toContainEqual(["library-stats"]);
    expect(keys).toContainEqual(["performance-highlights"]);
    expect(keys).toContainEqual(ORBIT_GRAPH_QUERY_KEY);
    expect(keys.some((key) => key?.[0] === "bookmarks")).toBe(false);
  });

  it("invalidates orbit apply queries without analytics", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();

    await invalidateOrbitApplyQueries(queryClient);

    const keys = invalidateSpy.mock.calls.map(([args]) => args.queryKey);
    expect(keys.some((key) => key?.[0] === "bookmarks")).toBe(true);
    expect(keys).toContainEqual(["tags"]);
    expect(keys).toContainEqual(["collections"]);
    expect(keys).toContainEqual(["library-stats"]);
    expect(keys).toContainEqual(ORBIT_SCAN_CANDIDATES_QUERY_KEY);
    expect(keys).not.toContainEqual(ORBIT_GRAPH_QUERY_KEY);
    expect(keys.some((key) => key?.[0] === "analytics")).toBe(false);
    expect(keys.some((key) => key?.[0] === "performance-highlights")).toBe(false);
    expect(
      invalidateSpy.mock.calls.every(
        ([args]) => args.refetchType === "active" || args.refetchType === undefined
      )
    ).toBe(true);
  });

  it("can mark orbit apply queries stale without refetching", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();

    await invalidateOrbitApplyQueries(queryClient, { refetchType: "none" });

    expect(
      invalidateSpy.mock.calls.every(([args]) => args.refetchType === "none")
    ).toBe(true);
  });

  it("can include the orbit graph after a library-wide apply", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();

    await invalidateOrbitApplyQueries(queryClient, { includeGraph: true });

    const keys = invalidateSpy.mock.calls.map(([args]) => args.queryKey);
    expect(keys).toContainEqual(ORBIT_GRAPH_QUERY_KEY);
    expect(keys).toContainEqual(ORBIT_SCAN_CANDIDATES_QUERY_KEY);
  });

  it("invalidates collection metadata without library stats or orbit graph", async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();

    await invalidateCollectionMetadataQueries(queryClient, "collection-1");

    const keys = invalidateSpy.mock.calls.map(([args]) => args.queryKey);
    expect(keys).toContainEqual(["collection", "collection-1"]);
    expect(keys).toContainEqual(["collections"]);
    expect(keys.some((key) => key?.[0] === "library-stats")).toBe(false);
    expect(keys.some((key) => key?.[0] === "orbit")).toBe(false);
  });
});
