// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useListScrollMargin } from "./use-list-scroll-margin";

function withTop(element: HTMLElement, getTop: () => number) {
  element.getBoundingClientRect = () =>
    ({ top: getTop(), left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: getTop() }) as DOMRect;
}

describe("useListScrollMargin", () => {
  it("measures the list offset inside the scroller, independent of scroll position", () => {
    const scroller = document.createElement("div");
    const header = document.createElement("header");
    const list = document.createElement("div");
    scroller.append(header, list);
    document.body.append(scroller);

    // Scroller at viewport y=40, scrolled 300px; list content starts 180px
    // into the scroller → its viewport top is 40 + 180 - 300 = -80.
    scroller.scrollTop = 300;
    withTop(scroller, () => 40);
    withTop(list, () => -80);

    const { result } = renderHook(() => useListScrollMargin(scroller));
    expect(result.current.scrollMargin).toBe(0);

    act(() => {
      result.current.listRef(list);
    });

    expect(result.current.scrollMargin).toBe(180);
    scroller.remove();
  });

  it("stays at zero without a scroll element", () => {
    const { result } = renderHook(() => useListScrollMargin(null));
    act(() => {
      result.current.listRef(document.createElement("div"));
    });
    expect(result.current.scrollMargin).toBe(0);
  });
});
