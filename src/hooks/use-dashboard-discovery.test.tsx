// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fetch-json", () => ({
  fetchJson: vi.fn(),
}));

import { fetchJson } from "@/lib/fetch-json";
import { useDashboardDiscovery } from "@/hooks/use-dashboard-discovery";

const EXTRA_EXCLUDE = ["extra-exclude"];

function bookmark(id: string) {
  return {
    id,
    tweetId: id,
    authorUsername: "author",
    authorDisplayName: "Author",
    tweetText: `Bookmark ${id}`,
    tweetCreatedAt: "2026-01-01T00:00:00.000Z",
    bookmarkedAt: "2026-01-02T00:00:00.000Z",
    tags: [],
    notes: [],
    collectionItems: [],
    publicMetrics: null,
  };
}

function highlightsResponse(ids: string[]) {
  return {
    bookmarks: ids.map((id) => bookmark(id)),
    total: ids.length,
    totalPages: 1,
  };
}

function highlightCalls() {
  return vi.mocked(fetchJson).mock.calls.filter((call) =>
    String(call[0]).includes("/api/bookmarks/highlights")
  );
}

function installIdleGate() {
  const queue: Array<IdleRequestCallback> = [];
  vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
    queue.push(callback);
    return queue.length;
  });
  vi.stubGlobal("cancelIdleCallback", (id: number) => {
    queue[id - 1] = () => {};
  });
  return {
    flush() {
      const callbacks = queue.splice(0, queue.length);
      for (const callback of callbacks) {
        callback({ didTimeout: false, timeRemaining: () => 50 });
      }
    },
  };
}

function renderDiscovery<T>(hook: (props: { feedReady: boolean }) => T) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return renderHook(hook, {
    wrapper,
    initialProps: { feedReady: false },
  });
}

describe("useDashboardDiscovery highlights timing", () => {
  let idle: ReturnType<typeof installIdleGate>;

  beforeEach(() => {
    localStorage.clear();
    idle = installIdleGate();
    vi.mocked(fetchJson).mockReset();
    vi.mocked(fetchJson).mockResolvedValue(highlightsResponse(["a", "b", "c", "d"]));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not request highlights before the feed is ready", async () => {
    renderDiscovery(() => useDashboardDiscovery({ feedReady: false }));

    await act(async () => {
      idle.flush();
    });

    expect(highlightCalls()).toHaveLength(0);
  });

  it("sends one highlights request after the feed has painted", async () => {
    const { result, rerender } = renderDiscovery(({ feedReady }) => {
      const parent = useDashboardDiscovery({ feedReady });
      const child = useDashboardDiscovery({
        feedReady,
        parentData: {
          ...parent.discoveryParentData,
          // A second subscriber with a different exclude list used to miss the
          // cache and fire another highlights request.
          excludeIds: EXTRA_EXCLUDE,
        },
      });
      return { parent, child };
    });

    rerender({ feedReady: true });
    await act(async () => {});
    expect(highlightCalls()).toHaveLength(0);
    expect(result.current.parent.isLoading).toBe(true);

    await act(async () => {
      idle.flush();
    });

    await waitFor(() => {
      expect(highlightCalls()).toHaveLength(1);
    });

    const urls = highlightCalls().map((call) => String(call[0]));
    expect(urls).toEqual(["/api/bookmarks/highlights?raw=true&limit=24"]);
    expect(urls.some((url) => url.includes("extra-exclude"))).toBe(false);

    await waitFor(() => {
      expect(result.current.parent.isLoading).toBe(false);
    });

    expect(result.current.child.discoveryCarouselItems.map((item) => item.bookmark.id)).toEqual(
      result.current.parent.discoveryCarouselItems.map((item) => item.bookmark.id)
    );
    expect(highlightCalls()).toHaveLength(1);
  });

  it("still loads library filler after paint when the raw pool cannot fill the strip", async () => {
    vi.mocked(fetchJson).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("raw=true")) return highlightsResponse(["a", "b"]);
      return highlightsResponse(["library"]);
    });

    const { rerender } = renderDiscovery(({ feedReady }) =>
      useDashboardDiscovery({ feedReady })
    );

    rerender({ feedReady: true });
    await act(async () => {
      idle.flush();
    });

    await waitFor(() => {
      expect(highlightCalls().map((call) => String(call[0]))).toEqual([
        "/api/bookmarks/highlights?raw=true&limit=24",
        "/api/bookmarks/highlights?limit=4",
      ]);
    });
  });
});
