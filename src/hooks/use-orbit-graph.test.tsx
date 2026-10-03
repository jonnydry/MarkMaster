// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { signOut as nextAuthSignOut } from "next-auth/react";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(async () => undefined),
}));

import { clearOrbitGraphEtags, useOrbitGraphQuery } from "@/hooks/use-orbit-graph";
import { signOut } from "@/lib/client-sign-out";

const payload = {
  nodes: [
    { kind: "core", id: "orbit-index", totalBookmarks: 0, looseBookmarks: 0 },
  ],
  edges: [],
  stats: {
    tagCount: 0,
    userCollectionCount: 0,
    xFolderCount: 0,
  },
  generatedAt: "2026-01-01T00:00:00.000Z",
  nodeCap: 1000,
};

function jsonResponse(etag: string) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json", etag },
  });
}

function renderGraph() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return renderHook(() => useOrbitGraphQuery(), { wrapper });
}

function ifNoneMatch(call: unknown[] | undefined) {
  const init = call?.[1] as RequestInit | undefined;
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.["If-None-Match"];
}

describe("orbit graph etag cache", () => {
  afterEach(() => {
    clearOrbitGraphEtags();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("sends the cached etag only until it is cleared", async () => {
    const fetchMock = vi.fn(async () => jsonResponse('W/"user-a"'));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderGraph();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await result.current.refetch();
    expect(ifNoneMatch(fetchMock.mock.calls[1])).toBe('W/"user-a"');

    clearOrbitGraphEtags();
    await result.current.refetch();
    expect(ifNoneMatch(fetchMock.mock.calls[2])).toBeUndefined();
  });

  it("clears cached etags before signing out", async () => {
    const fetchMock = vi.fn(async () => jsonResponse('W/"user-a"'));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderGraph();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await result.current.refetch();
    expect(ifNoneMatch(fetchMock.mock.calls[1])).toBe('W/"user-a"');

    await signOut({ callbackUrl: "/" });

    expect(nextAuthSignOut).toHaveBeenCalledWith({ callbackUrl: "/" });
    await result.current.refetch();
    expect(ifNoneMatch(fetchMock.mock.calls[2])).toBeUndefined();
  });
});
