// @vitest-environment jsdom
import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OrbitMapCanvasHost from "./orbit-map-canvas-host";
import { MainMessageType, WorkerMessageType } from "@/lib/orbit-worker-protocol";
import type { OrbitGraphPayload } from "@/types";

function postedTypes(worker: WorkerMock) {
  return worker.postMessage.mock.calls.map((call) => call[0]?.type);
}

function makeGraph(generatedAt: string): OrbitGraphPayload {
  return {
    nodes: [
      {
        kind: "tag",
        id: "tag-1",
        name: "History",
        color: "#1569cb",
        count: 1,
      },
      {
        kind: "bookmark",
        id: "bookmark-1",
        title: "Example",
        authorUsername: "author",
        authorDisplayName: "Author",
        affiliated: false,
        recent: true,
      },
    ],
    edges: [{ kind: "loose", bookmarkId: "bookmark-1" }],
    stats: {
      totalBookmarks: 1,
      affiliatedBookmarks: 0,
      looseBookmarks: 1,
      renderedBookmarks: 1,
      truncatedBookmarks: 0,
      tagCount: 1,
      userCollectionCount: 0,
      xFolderCount: 0,
    },
    generatedAt,
    nodeCap: 1000,
    scope: "library",
  };
}

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

class WorkerMock {
  static instances: WorkerMock[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn();
  readonly addEventListener = vi.fn();
  readonly removeEventListener = vi.fn();

  constructor() {
    WorkerMock.instances.push(this);
  }
}

describe("OrbitMapCanvasHost DPR resize bridge", () => {
  const originalWorker = globalThis.Worker;
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalDevicePixelRatio = window.devicePixelRatio;
  const originalTransferControlToOffscreen = HTMLCanvasElement.prototype.transferControlToOffscreen;

  beforeEach(() => {
    vi.useFakeTimers();
    WorkerMock.instances = [];
    ResizeObserverMock.instances = [];
    vi.stubGlobal("Worker", WorkerMock);
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal("OffscreenCanvas", vi.fn());
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 3,
    });
    HTMLCanvasElement.prototype.transferControlToOffscreen = vi.fn(() => ({} as OffscreenCanvas));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalWorker) vi.stubGlobal("Worker", originalWorker);
    if (originalResizeObserver) vi.stubGlobal("ResizeObserver", originalResizeObserver);
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: originalDevicePixelRatio,
    });
    HTMLCanvasElement.prototype.transferControlToOffscreen = originalTransferControlToOffscreen;
  });

  it("sends clamped DPR on init and resize messages", async () => {
    render(<OrbitMapCanvasHost />);

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    const worker = WorkerMock.instances[0];
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WorkerMessageType.INIT,
        dpr: 2,
      }),
      expect.any(Array)
    );

    await act(async () => {
      ResizeObserverMock.instances[0].callback([
        {
          contentRect: { width: 320, height: 180 } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ], ResizeObserverMock.instances[0] as unknown as ResizeObserver);
      // RESIZE is coalesced onto a trailing animation frame.
      vi.runOnlyPendingTimers();
    });

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WorkerMessageType.RESIZE,
        width: 320,
        height: 180,
        dpr: 2,
      })
    );
  });

  it("re-syncs DPR when raw devicePixelRatio changes without a layout resize", async () => {
    render(<OrbitMapCanvasHost />);

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    const worker = WorkerMock.instances[0];
    worker.postMessage.mockClear();

    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 1.5,
    });

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      // RESIZE is coalesced onto a trailing animation frame.
      vi.runOnlyPendingTimers();
    });

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WorkerMessageType.RESIZE,
        dpr: 1.5,
      })
    );
  });
});

describe("OrbitMapCanvasHost graph + pointer gating", () => {
  const originalWorker = globalThis.Worker;
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalTransferControlToOffscreen = HTMLCanvasElement.prototype.transferControlToOffscreen;

  beforeEach(() => {
    vi.useFakeTimers();
    WorkerMock.instances = [];
    ResizeObserverMock.instances = [];
    vi.stubGlobal("Worker", WorkerMock);
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal("OffscreenCanvas", vi.fn());
    HTMLCanvasElement.prototype.transferControlToOffscreen = vi.fn(() => ({} as OffscreenCanvas));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalWorker) vi.stubGlobal("Worker", originalWorker);
    if (originalResizeObserver) vi.stubGlobal("ResizeObserver", originalResizeObserver);
    HTMLCanvasElement.prototype.transferControlToOffscreen = originalTransferControlToOffscreen;
  });

  it("does not SET_GRAPH when only generatedAt changes", async () => {
    const graph = makeGraph("2026-06-11T12:00:00.000Z");
    const { rerender } = render(<OrbitMapCanvasHost graph={graph} />);

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    const worker = WorkerMock.instances[0];
    expect(worker).toBeTruthy();

    await act(async () => {
      worker.onmessage?.({
        data: { type: MainMessageType.READY, protocolVersion: 1 },
      } as MessageEvent);
    });

    expect(postedTypes(worker)).toContain(WorkerMessageType.SET_GRAPH);

    worker.postMessage.mockClear();

    rerender(
      <OrbitMapCanvasHost graph={makeGraph("2026-06-11T13:00:00.000Z")} />
    );

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(postedTypes(worker)).not.toContain(WorkerMessageType.SET_GRAPH);
    expect(postedTypes(worker)).not.toContain(WorkerMessageType.SET_FILTER);
  });

  it("does not post POINTER_MOVE for idle travel outside the canvas", async () => {
    const { container } = render(<OrbitMapCanvasHost />);

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    const worker = WorkerMock.instances[0];
    expect(worker).toBeTruthy();
    expect(container.querySelector("canvas")).toBeTruthy();
    worker.postMessage.mockClear();

    await act(async () => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          buttons: 0,
          clientX: 12,
          clientY: 24,
        })
      );
    });

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(postedTypes(worker)).not.toContain(WorkerMessageType.POINTER_MOVE);
  });

  it("posts SET_LIVING_MAP through the canvas handle", async () => {
    const ref = React.createRef<React.ComponentRef<typeof OrbitMapCanvasHost>>();
    render(<OrbitMapCanvasHost ref={ref} />);

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    const worker = WorkerMock.instances[0];
    worker.postMessage.mockClear();

    await act(async () => {
      ref.current?.setLivingMap(false);
    });

    expect(worker.postMessage).toHaveBeenCalledWith({
      type: WorkerMessageType.SET_LIVING_MAP,
      protocolVersion: 1,
      enabled: false,
    });
  });
});
