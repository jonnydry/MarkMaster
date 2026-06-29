// @vitest-environment jsdom
import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OrbitMapCanvasHost from "./orbit-map-canvas-host";
import { WorkerMessageType } from "@/lib/orbit-worker-protocol";

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
    });

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WorkerMessageType.RESIZE,
        dpr: 1.5,
      })
    );
  });
});
