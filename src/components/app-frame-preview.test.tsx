// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    prefetch: () => {},
  }),
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function DynamicStub() {
      return null;
    },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated", update: async () => null }),
}));

vi.mock("@/hooks/use-library-data", () => ({
  useTagsQuery: () => ({ data: [] }),
  useCollectionsQuery: () => ({ data: [] }),
  useLibraryStatsQuery: () => ({ data: undefined }),
}));

vi.mock("@/hooks/use-sync-status", () => ({
  useSyncStatus: () => ({ data: undefined }),
}));

vi.mock("@/hooks/use-create-collection", () => ({
  useCreateCollection: () => ({ createCollection: async () => {} }),
}));

vi.mock("@/components/orbit-library-tag-provider", () => ({
  OrbitLibraryTagProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/kept-routes", async () => {
  const actual = await vi.importActual<typeof import("@/components/kept-routes")>(
    "@/components/kept-routes"
  );
  return {
    ...actual,
    KeptRoutes: () => null,
  };
});

vi.mock("@/components/sidebar-dynamic", async () => {
  const { createElement } = await import("react");
  const { useRoutePreview } = await import("@/components/route-preview");

  return {
    Sidebar: function PreviewProbe() {
      const { showRoute, shownPath } = useRoutePreview();
      return createElement(
        "div",
        null,
        createElement("div", { "data-testid": "shown-path" }, shownPath),
        createElement(
          "button",
          { type: "button", onClick: () => showRoute("/orbit/map") },
          "Show map"
        ),
        createElement(
          "button",
          { type: "button", onClick: () => showRoute("/orbit") },
          "Show orbit"
        )
      );
    },
  };
});

import { AppFrame } from "@/components/app-frame";

function shownPath() {
  return screen.getByTestId("shown-path").textContent;
}

describe("AppFrame route preview", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    nav.pathname = "/dashboard";
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderFrame() {
    const view = render(
      <QueryClientProvider client={queryClient}>
        <AppFrame>
          <p>page body</p>
        </AppFrame>
      </QueryClientProvider>
    );
    return {
      go(pathname: string) {
        nav.pathname = pathname;
        view.rerender(
          <QueryClientProvider client={queryClient}>
            <AppFrame>
              <p>page body</p>
            </AppFrame>
          </QueryClientProvider>
        );
      },
    };
  }

  it("clears a map preview when the URL leaves for another route", () => {
    const frame = renderFrame();
    fireEvent.click(screen.getByRole("button", { name: "Show map" }));

    expect(screen.getByText("Charting map…")).toBeInTheDocument();
    expect(shownPath()).toBe("/orbit/map");

    frame.go("/collections/col-1");

    expect(screen.queryByText("Charting map…")).not.toBeInTheDocument();
    expect(screen.getByText("page body")).toBeInTheDocument();
    expect(shownPath()).toBe("/collections/col-1");
  });

  it("clears a map preview when the URL reaches the map", () => {
    const frame = renderFrame();
    fireEvent.click(screen.getByRole("button", { name: "Show map" }));

    frame.go("/orbit/map");

    expect(screen.queryByText("Charting map…")).not.toBeInTheDocument();
    expect(screen.getByText("page body")).toBeInTheDocument();
    expect(shownPath()).toBe("/orbit/map");
  });

  it("clears a map preview after the backstop when the URL never changes", async () => {
    const frame = renderFrame();
    frame.go("/collections/col-1");
    fireEvent.click(screen.getByRole("button", { name: "Show map" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByText("Charting map…")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(13_000);
    });
    expect(screen.queryByText("Charting map…")).not.toBeInTheDocument();
    expect(screen.getByText("page body")).toBeInTheDocument();
    expect(shownPath()).toBe("/collections/col-1");
  });

  it("clears a non-map preview after 2s when the URL stays put", async () => {
    const frame = renderFrame();
    frame.go("/collections/col-1");
    fireEvent.click(screen.getByRole("button", { name: "Show orbit" }));

    expect(shownPath()).toBe("/orbit");
    expect(screen.queryByText("page body")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_999);
    });
    expect(shownPath()).toBe("/orbit");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(shownPath()).toBe("/collections/col-1");
    expect(screen.getByText("page body")).toBeInTheDocument();
  });
});
