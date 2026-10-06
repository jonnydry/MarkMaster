// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BookmarkThumbnail } from "./bookmark-thumbnail";

const CARD_SRC = "/api/bookmarks/bm_1/card-image";

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  observed: Element[];
};

let observers: ObserverRecord[] = [];
let intersectOnObserve = false;

class MockIntersectionObserver {
  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit
  ) {
    const record: ObserverRecord = { callback, options, observed: [] };
    observers.push(record);
    this.record = record;
  }

  record: ObserverRecord;

  observe(target: Element) {
    this.record.observed.push(target);
    if (intersectOnObserve) {
      this.record.callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
    }
  }

  unobserve() {}

  disconnect() {}

  takeRecords() {
    return [];
  }
}

function proxyBookmark() {
  return {
    id: "bm_1",
    media: null,
    urls: null,
    cardUrl: "https://example.com/article",
  };
}

function rect(partial: Partial<DOMRect>): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON() {
      return {};
    },
    ...partial,
  } as DOMRect;
}

function renderThumbnail(
  props: Partial<React.ComponentProps<typeof BookmarkThumbnail>> = {}
) {
  return render(
    <BookmarkThumbnail
      bookmark={proxyBookmark()}
      alt="Preview"
      sizes="96px"
      fallback={<span>Text bookmark</span>}
      {...props}
    />
  );
}

describe("BookmarkThumbnail card image", () => {
  beforeEach(() => {
    observers = [];
    intersectOnObserve = false;
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      rect({ width: 0, height: 0 })
    );
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not request card-image until an off-screen thumbnail intersects", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      rect({ top: 4000, bottom: 4200, left: 0, right: 240, width: 240, height: 200 })
    );

    const { container } = renderThumbnail();

    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByText("Text bookmark")).not.toBeInTheDocument();
    expect(observers).toHaveLength(1);
    expect(observers[0]?.options?.rootMargin).toBe("300px");

    act(() => {
      observers[0]?.callback(
        [{ isIntersecting: false, target: container.firstChild } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(container.querySelector("img")).toBeNull();

    act(() => {
      observers[0]?.callback(
        [{ isIntersecting: true, target: container.firstChild } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    const img = screen.getByRole("img", { name: "Preview" });
    expect(img).toHaveAttribute("src", CARD_SRC);
    expect(img).toHaveAttribute("loading", "eager");
  });

  it("requests card-image when a thumbnail is already intersecting", () => {
    intersectOnObserve = true;

    renderThumbnail();

    expect(screen.getByRole("img", { name: "Preview" })).toHaveAttribute("src", CARD_SRC);
    expect(observers).toHaveLength(1);
  });

  it("loads a thumbnail already inside the viewport without waiting to scroll", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      rect({ top: 40, bottom: 240, left: 16, right: 256, width: 240, height: 200 })
    );

    renderThumbnail();

    expect(screen.getByRole("img", { name: "Preview" })).toHaveAttribute("src", CARD_SRC);
    expect(observers).toHaveLength(0);
  });

  it("keeps a priority thumbnail eager even when it is measured off-screen", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      rect({ top: 4000, bottom: 4200, left: 0, right: 240, width: 240, height: 200 })
    );

    renderThumbnail({ priority: true });

    expect(screen.getByRole("img", { name: "Preview" })).toHaveAttribute("src", CARD_SRC);
    expect(observers).toHaveLength(0);
  });

  it("still falls back when there is no card image or the image fails", () => {
    const { rerender } = renderThumbnail({
      bookmark: { id: "bm_1", media: null, urls: null, cardUrl: null },
    });

    expect(screen.getByText("Text bookmark")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(observers).toHaveLength(0);

    intersectOnObserve = true;
    rerender(
      <BookmarkThumbnail
        bookmark={proxyBookmark()}
        alt="Preview"
        sizes="96px"
        fallback={<span>Text bookmark</span>}
      />
    );

    fireEvent.error(screen.getByRole("img", { name: "Preview" }));
    expect(screen.getByText("Text bookmark")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Preview" })).not.toBeInTheDocument();
  });
});
