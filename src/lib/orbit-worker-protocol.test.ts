// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  WorkerMessageType,
  getHotPathWorkerMessageError,
  getSafeDpr,
  getWorkerMessageValidationError,
  isHotPathWorkerMessageType,
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

  it("treats pointer traffic as a hot-path envelope check", () => {
    expect(isHotPathWorkerMessageType(WorkerMessageType.POINTER_MOVE)).toBe(true);
    expect(isHotPathWorkerMessageType(WorkerMessageType.SET_GRAPH)).toBe(false);
    expect(getHotPathWorkerMessageError({
      type: WorkerMessageType.POINTER_MOVE,
      protocolVersion: 1,
    })).toBeNull();
    expect(getHotPathWorkerMessageError({
      type: WorkerMessageType.POINTER_MOVE,
      protocolVersion: 2,
    })).toMatch(/protocolVersion/);
  });

  it("accepts a living-map toggle after init", () => {
    expect(getWorkerMessageValidationError({
      type: WorkerMessageType.SET_LIVING_MAP,
      protocolVersion: 1,
      enabled: false,
    })).toBeNull();

    expect(getWorkerMessageValidationError({
      type: WorkerMessageType.SET_LIVING_MAP,
      protocolVersion: 1,
      enabled: "false",
    })).toMatch(/SET_LIVING_MAP.enabled/);
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
