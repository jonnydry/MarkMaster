import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { copyCollectionAsUserCollection } from "@/lib/collection-copy";
import { ORBIT_GRAPH_QUERY_KEY } from "@/lib/query-invalidation";
import type { CollectionWithCount } from "@/types";

const copiedCollection: CollectionWithCount = {
  id: "collection-copy",
  name: "Launch Reads (Copy)",
  description: "Copied from X folder",
  type: "user_collection",
  isPublic: false,
  shareSlug: null,
  externalSource: null,
  externalSourceId: null,
  createdAt: "2026-05-10T12:00:00.000Z",
  _count: { items: 3 },
};

describe("copyCollectionAsUserCollection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts to the existing collection copy route and refreshes library state", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(copiedCollection), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );
    const queryClient = new QueryClient();
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();

    await expect(
      copyCollectionAsUserCollection("x-folder-1", queryClient)
    ).resolves.toEqual(copiedCollection);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/collections/x-folder-1/copy",
      expect.objectContaining({ method: "POST" })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["collections"] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ORBIT_GRAPH_QUERY_KEY,
    });
  });
});
