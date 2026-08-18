// @vitest-environment jsdom
import React, { useRef } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OrbitMapHoverOwner,
  type OrbitMapHoverHandler,
} from "./orbit-map-hover-owner";
import type { OrbitGraphPayload } from "@/types";

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }

  observe() {}
  unobserve() {}
  disconnect() {}
}

const graph: OrbitGraphPayload = {
  nodes: [
    {
      kind: "bookmark",
      id: "bookmark-1",
      title: "A note on maps",
      authorUsername: "ada",
      authorDisplayName: "Ada",
      affiliated: false,
      recent: true,
    },
    {
      kind: "tag",
      id: "tag-1",
      name: "History",
      color: "#1569cb",
      count: 4,
    },
  ],
  edges: [],
  stats: {
    totalBookmarks: 1,
    affiliatedBookmarks: 0,
    looseBookmarks: 1,
    renderedBookmarks: 1,
    truncatedBookmarks: 0,
    tagCount: 0,
    userCollectionCount: 0,
    xFolderCount: 0,
  },
  generatedAt: "2026-08-18T00:00:00.000Z",
  nodeCap: 1000,
  scope: "library",
};

function Harness({
  payload = graph,
  onReady,
}: {
  payload?: OrbitGraphPayload;
  onReady: (handler: OrbitMapHoverHandler) => void;
}) {
  const handlerRef = useRef<OrbitMapHoverHandler | null>(null);
  return (
    <div style={{ width: 800, height: 600 }}>
      <OrbitMapHoverOwner
        graph={payload}
        handlerRef={{
          get current() {
            return handlerRef.current;
          },
          set current(value) {
            handlerRef.current = value;
            if (value) onReady(value);
          },
        }}
      />
    </div>
  );
}

describe("OrbitMapHoverOwner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ResizeObserverMock.instances = [];
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows a bookmark card after the intent delay and hides it on leave", () => {
    let handler: OrbitMapHoverHandler | null = null;
    render(
      <Harness
        onReady={(next) => {
          handler = next;
        }}
      />
    );

    expect(handler).toBeTruthy();
    act(() => {
      handler?.({ kind: "bookmark", id: "bookmark-1" }, { x: 40, y: 50 });
    });
    expect(screen.queryByText("@ada")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(140);
    });
    expect(screen.getByText("@ada")).toBeTruthy();
    expect(screen.getByText("A note on maps")).toBeTruthy();

    act(() => {
      handler?.(null);
      vi.advanceTimersByTime(140);
    });
    expect(screen.queryByText("@ada")).toBeNull();
  });

  it("shows a hub card for tags", () => {
    let handler: OrbitMapHoverHandler | null = null;
    render(
      <Harness
        onReady={(next) => {
          handler = next;
        }}
      />
    );

    act(() => {
      handler?.({ kind: "tag", id: "tag-1" }, { x: 20, y: 20 });
      vi.advanceTimersByTime(140);
    });

    expect(screen.getByText("History")).toBeTruthy();
    expect(screen.getByText("4 bookmarks")).toBeTruthy();
    expect(screen.getByText("Tag")).toBeTruthy();
  });
});
