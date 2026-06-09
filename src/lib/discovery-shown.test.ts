import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  addDiscoveryShownIds,
  getDiscoveryShownIds,
  shuffleWithSeed,
} from "./discovery-shown";

describe("discovery-shown", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      store: {} as Record<string, string>,
      getItem(key: string) {
        return this.store[key] ?? null;
      },
      setItem(key: string, value: string) {
        this.store[key] = value;
      },
    });
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
    });
  });

  it("stores and returns recently shown bookmark IDs", () => {
    addDiscoveryShownIds(["a", "b"]);
    expect(getDiscoveryShownIds()).toEqual(["a", "b"]);
    addDiscoveryShownIds(["c"]);
    expect(getDiscoveryShownIds()).toEqual(["a", "b", "c"]);
  });

  it("shuffleWithSeed is deterministic for the same seed", () => {
    const items = ["a", "b", "c", "d", "e"];
    const first = shuffleWithSeed(items, "seed-1");
    const second = shuffleWithSeed(items, "seed-1");
    const third = shuffleWithSeed(items, "seed-2");

    expect(first).toEqual(second);
    expect(first).not.toEqual(third);
    expect(new Set(first)).toEqual(new Set(items));
  });
});
