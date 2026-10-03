// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/orbit", search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

import { useRouteSearchParams } from "@/hooks/use-route-search-params";

function go(pathname: string, search = "") {
  navigation.pathname = pathname;
  navigation.search = search;
}

describe("useRouteSearchParams", () => {
  it("follows the query while its route is showing", () => {
    go("/orbit", "view=all");
    const { result, rerender } = renderHook(() => useRouteSearchParams("/orbit"));
    expect(result.current.get("view")).toBe("all");

    go("/orbit", "view=recent");
    rerender();
    expect(result.current.get("view")).toBe("recent");
  });

  it("ignores other routes' queries and keeps a stable value", () => {
    go("/orbit", "view=all&page=3");
    const { result, rerender } = renderHook(() => useRouteSearchParams("/orbit"));
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
    const { result, rerender } = renderHook(() => useRouteSearchParams("/orbit"));
    expect(result.current.toString()).toBe("");

    go("/orbit", "intent=oldest");
    rerender();
    expect(result.current.get("intent")).toBe("oldest");
  });
});
