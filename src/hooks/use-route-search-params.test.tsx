// @vitest-environment jsdom
import { render, renderHook, screen } from "@testing-library/react";
import { memo, useEffect, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/orbit", search: "" }));
const renders = vi.hoisted(() => ({
  dashboard: 0,
  analytics: 0,
  settings: 0,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

import {
  RouteSearchParamsProvider,
  useRouteSearchParams,
} from "@/hooks/use-route-search-params";

function go(pathname: string, search = "") {
  navigation.pathname = pathname;
  navigation.search = search;
}

function wrapper({ children }: { children: ReactNode }) {
  return <RouteSearchParamsProvider>{children}</RouteSearchParamsProvider>;
}

const DashboardProbe = memo(function DashboardProbe() {
  const params = useRouteSearchParams("/dashboard");
  useEffect(() => {
    renders.dashboard += 1;
  });
  return <span data-testid="dashboard">{params.toString()}</span>;
});

const AnalyticsProbe = memo(function AnalyticsProbe() {
  const params = useRouteSearchParams("/analytics");
  useEffect(() => {
    renders.analytics += 1;
  });
  return <span data-testid="analytics">{params.toString()}</span>;
});

const SettingsProbe = memo(function SettingsProbe() {
  const params = useRouteSearchParams("/settings");
  useEffect(() => {
    renders.settings += 1;
  });
  return <span data-testid="settings">{params.toString()}</span>;
});

function Probes() {
  return (
    <RouteSearchParamsProvider>
      <DashboardProbe />
      <AnalyticsProbe />
      <SettingsProbe />
    </RouteSearchParamsProvider>
  );
}

describe("useRouteSearchParams", () => {
  it("follows the query while its route is showing", () => {
    go("/orbit", "view=all");
    const { result, rerender } = renderHook(() => useRouteSearchParams("/orbit"), {
      wrapper,
    });
    expect(result.current.get("view")).toBe("all");

    go("/orbit", "view=recent");
    rerender();
    expect(result.current.get("view")).toBe("recent");
  });

  it("ignores other routes' queries and keeps a stable value", () => {
    go("/orbit", "view=all&page=3");
    const { result, rerender } = renderHook(() => useRouteSearchParams("/orbit"), {
      wrapper,
    });
    const onOrbit = result.current;

    go("/dashboard", "tag=abc");
    rerender();
    go("/orbit/map", "select=tag-1&kind=tag");
    rerender();

    expect(result.current).toBe(onOrbit);
    expect(result.current.toString()).toBe("view=all&page=3");
  });

  it("starts empty when mounted while another route is showing", () => {
    go("/dashboard", "tag=abc");
    const { result, rerender } = renderHook(() => useRouteSearchParams("/orbit"), {
      wrapper,
    });
    expect(result.current.toString()).toBe("");

    go("/orbit", "intent=oldest");
    rerender();
    expect(result.current.get("intent")).toBe("oldest");
  });

  it("does not re-render hidden pages when another route's query changes", () => {
    renders.dashboard = 0;
    renders.analytics = 0;
    renders.settings = 0;
    go("/dashboard", "tag=abc");
    const view = render(<Probes />);

    expect(renders).toEqual({ dashboard: 1, analytics: 1, settings: 1 });
    expect(screen.getByTestId("dashboard")).toHaveTextContent("tag=abc");

    go("/orbit/map", "select=tag-1&kind=tag");
    view.rerender(<Probes />);

    expect(renders).toEqual({ dashboard: 1, analytics: 1, settings: 1 });
    expect(screen.getByTestId("dashboard")).toHaveTextContent("tag=abc");
    expect(screen.getByTestId("analytics")).toHaveTextContent("");
    expect(screen.getByTestId("settings")).toHaveTextContent("");

    go("/analytics", "tab=activity");
    view.rerender(<Probes />);

    expect(renders.dashboard).toBe(1);
    expect(renders.settings).toBe(1);
    expect(renders.analytics).toBe(2);
    expect(screen.getByTestId("analytics")).toHaveTextContent("tab=activity");
    expect(screen.getByTestId("dashboard")).toHaveTextContent("tag=abc");
  });
});
