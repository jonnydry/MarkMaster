// @vitest-environment jsdom

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const probes = vi.hoisted(() => ({
  /** Pages whose effects are currently mounted. */
  mounted: new Set<string>(),
  /** Times each page's effects have mounted. */
  effectRuns: new Map<string, number>(),
}));

vi.mock("next/dynamic", async () => {
  const { createElement, lazy, Suspense } = await import("react");
  return {
    default: (loader: () => Promise<{ default: React.ComponentType }>) => {
      const Lazy = lazy(loader);
      return function Dynamic() {
        return createElement(Suspense, { fallback: null }, createElement(Lazy));
      };
    },
  };
});

function mockPage(name: string) {
  return async () => {
    const { createElement, useEffect, useState } = await import("react");
    function Page() {
      const [clicks, setClicks] = useState(0);
      useEffect(() => {
        probes.mounted.add(name);
        probes.effectRuns.set(name, (probes.effectRuns.get(name) ?? 0) + 1);
        return () => {
          probes.mounted.delete(name);
        };
      }, []);
      return createElement(
        "button",
        { "data-testid": name, onClick: () => setClicks((count) => count + 1) },
        `${name}:${clicks}`
      );
    }
    return { default: Page };
  };
}

vi.mock("@/app/(main)/dashboard/dashboard-client", mockPage("/dashboard"));
vi.mock("@/app/(main)/orbit/orbit-client", mockPage("/orbit"));
vi.mock("@/app/(main)/collections/collections-client", mockPage("/collections"));
vi.mock("@/app/(main)/analytics/analytics-client", mockPage("/analytics"));
vi.mock("@/app/(main)/settings/settings-client", mockPage("/settings"));
vi.mock("@/components/app-route-error", () => ({ AppRouteError: () => null }));

const prefetchAppRoute = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prefetch-app-route", () => ({ prefetchAppRoute }));

import { KeptRoutes } from "@/components/kept-routes";

const ALL_ROUTES = ["/dashboard", "/orbit", "/collections", "/analytics", "/settings"];

function renderKeptRoutes(pathname: string) {
  const queryClient = new QueryClient();
  const tree = (path: string) => (
    <QueryClientProvider client={queryClient}>
      <div id="app-main-content" tabIndex={-1} />
      <KeptRoutes pathname={path} />
    </QueryClientProvider>
  );
  const view = render(tree(pathname));
  return { navigate: (next: string) => view.rerender(tree(next)) };
}

async function finishWarmUp() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
}

describe("KeptRoutes", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    probes.mounted.clear();
    probes.effectRuns.clear();
    prefetchAppRoute.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pre-renders the other pages hidden, without their effects, and prefetches their data", async () => {
    renderKeptRoutes("/dashboard");
    await finishWarmUp();

    await waitFor(() => expect(screen.getByTestId("/settings")).toBeInTheDocument());
    expect(prefetchAppRoute.mock.calls.map(([, href]) => href)).toEqual(
      ALL_ROUTES.filter((href) => href !== "/dashboard")
    );
    expect([...probes.mounted]).toEqual(["/dashboard"]);
    expect(screen.getByTestId("/dashboard")).toBeVisible();
    expect(screen.getByTestId("/orbit")).not.toBeVisible();
  });

  it("pauses a page's effects while hidden and keeps its state", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { navigate } = renderKeptRoutes("/dashboard");
    await finishWarmUp();
    await waitFor(() => expect(screen.getByTestId("/orbit")).toBeInTheDocument());

    await user.click(screen.getByTestId("/dashboard"));
    await user.click(screen.getByTestId("/dashboard"));

    navigate("/orbit");
    await waitFor(() => expect(probes.mounted.has("/orbit")).toBe(true));
    expect(probes.mounted.has("/dashboard")).toBe(false);
    expect(screen.getByTestId("/orbit")).toBeVisible();

    navigate("/dashboard");
    await waitFor(() => expect(probes.mounted.has("/dashboard")).toBe(true));
    expect(screen.getByTestId("/dashboard")).toHaveTextContent("/dashboard:2");
    expect(probes.effectRuns.get("/dashboard")).toBe(2);
    expect(probes.mounted.has("/orbit")).toBe(false);
  });

  it("moves focus out of a page as it is hidden", async () => {
    const { navigate } = renderKeptRoutes("/dashboard");
    await waitFor(() => expect(screen.getByTestId("/dashboard")).toBeInTheDocument());
    screen.getByTestId("/dashboard").focus();

    navigate("/orbit");

    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById("app-main-content"))
    );
  });
});

/*
 * KeptRoutes relies on this: a hidden Activity tears down query
 * subscriptions, so off-screen pages sit out invalidation refetches, and
 * showing the page refetches whatever went stale meanwhile.
 */
describe("queries inside a hidden page", () => {
  function renderPageQuery(initialMode: "visible" | "hidden") {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const queryFn = vi.fn(async () => "rows");
    function Rows() {
      const { data } = useQuery({ queryKey: ["rows"], queryFn, staleTime: 60_000 });
      return <span>{data ?? "loading"}</span>;
    }
    const tree = (mode: "visible" | "hidden"): ReactNode => (
      <QueryClientProvider client={queryClient}>
        <Activity mode={mode}>
          <Rows />
        </Activity>
      </QueryClientProvider>
    );
    const view = render(tree(initialMode));
    return {
      queryClient,
      queryFn,
      setMode: (mode: "visible" | "hidden") => view.rerender(tree(mode)),
    };
  }

  it("does not fetch while pre-rendered hidden (so warm-up must prefetch)", async () => {
    const { queryFn, setMode } = renderPageQuery("hidden");
    await act(async () => {
      await Promise.resolve();
    });
    expect(queryFn).not.toHaveBeenCalled();

    setMode("visible");
    await waitFor(() => expect(queryFn).toHaveBeenCalledOnce());
  });

  it("skips invalidation refetches while hidden, then refetches when shown", async () => {
    const { queryClient, queryFn, setMode } = renderPageQuery("visible");
    await waitFor(() => expect(queryFn).toHaveBeenCalledOnce());

    setMode("hidden");
    await act(() => queryClient.invalidateQueries({ queryKey: ["rows"] }));
    expect(queryFn).toHaveBeenCalledOnce();

    setMode("visible");
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
  });

  it("does not refetch on show when nothing went stale", async () => {
    const { queryFn, setMode } = renderPageQuery("visible");
    await waitFor(() => expect(queryFn).toHaveBeenCalledOnce());

    setMode("hidden");
    setMode("visible");
    await act(async () => {
      await Promise.resolve();
    });
    expect(queryFn).toHaveBeenCalledOnce();
  });
});
