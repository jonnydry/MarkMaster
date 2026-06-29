// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  WorkerMessageType,
  getSafeDpr,
  getWorkerMessageValidationError,
  subscribeToDevicePixelRatioChanges,
} from "./orbit-worker-protocol";

describe("orbit worker protocol validation", () => {
  it("clamps unsafe device pixel ratios to a sane render resolution", () => {
    expect(getSafeDpr(undefined)).toBe(1);
    expect(getSafeDpr(0)).toBe(1);
    expect(getSafeDpr(Number.NaN)).toBe(1);
    expect(getSafeDpr(1.5)).toBe(1.5);
    expect(getSafeDpr(3)).toBe(2);
  });

  it("accepts a resize message with finite dimensions and optional DPR", () => {
    expect(getWorkerMessageValidationError({
      type: WorkerMessageType.RESIZE,
      protocolVersion: 1,
      width: 800,
      height: 600,
      dpr: 2,
    })).toBeNull();
  });

  it("rejects malformed worker messages before handlers can throw", () => {
    expect(getWorkerMessageValidationError({
      type: WorkerMessageType.RESIZE,
      protocolVersion: 1,
      width: "800",
      height: 600,
    })).toMatch(/RESIZE.width/);

    expect(getWorkerMessageValidationError({
      type: WorkerMessageType.SET_GRAPH,
      protocolVersion: 1,
    })).toMatch(/SET_GRAPH.graph/);

    expect(getWorkerMessageValidationError({
      type: WorkerMessageType.SET_THEME,
      protocolVersion: 1,
      colorMode: "sepia",
    })).toMatch(/SET_THEME.colorMode/);

    expect(getWorkerMessageValidationError(null)).toMatch(/object/);
  });
});

describe("subscribeToDevicePixelRatioChanges", () => {
  it("fires when raw DPR changes within the same clamped render value", () => {
    const listeners = new Map<string, Set<() => void>>();
    let rawDpr = 2.5;

    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      get: () => rawDpr,
    });

    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => {
        const subscribers = listeners.get(query) ?? new Set();
        listeners.set(query, subscribers);
        return {
          matches: true,
          media: query,
          addEventListener: (_event: string, handler: () => void) => {
            subscribers.add(handler);
          },
          removeEventListener: (_event: string, handler: () => void) => {
            subscribers.delete(handler);
          },
        };
      })
    );

    const onChange = vi.fn();
    const unsubscribe = subscribeToDevicePixelRatioChanges(onChange);

    rawDpr = 3;
    window.dispatchEvent(new Event("resize"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getSafeDpr(rawDpr)).toBe(2);
    expect(getSafeDpr(2.5)).toBe(2);

    unsubscribe();
    vi.unstubAllGlobals();
  });
});
