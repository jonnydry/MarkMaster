import { describe, expect, it } from "vitest";

import {
  ORBIT_MAP_LIVING_STORAGE_KEY,
  getOrbitMapLivingEnabled,
  setOrbitMapLivingEnabled,
} from "./orbit-map-living";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    data,
  };
}

describe("orbit map living preference", () => {
  it("defaults on and persists a URL opt-out", () => {
    const storage = memoryStorage();
    expect(
      getOrbitMapLivingEnabled({
        search: "",
        storage,
        matchMedia: () => ({ matches: false }),
      })
    ).toBe(true);

    expect(
      getOrbitMapLivingEnabled({
        search: "?living=0",
        storage,
        matchMedia: () => ({ matches: false }),
      })
    ).toBe(false);
    expect(storage.data[ORBIT_MAP_LIVING_STORAGE_KEY]).toBe("0");
  });

  it("stays off when the user prefers reduced motion", () => {
    expect(
      getOrbitMapLivingEnabled({
        search: "?living=1",
        storage: memoryStorage(),
        matchMedia: () => ({ matches: true }),
      })
    ).toBe(false);
  });

  it("writes the chrome toggle back to storage", () => {
    const storage = memoryStorage({ [ORBIT_MAP_LIVING_STORAGE_KEY]: "0" });
    setOrbitMapLivingEnabled(true, storage);
    expect(
      getOrbitMapLivingEnabled({
        search: "",
        storage,
        matchMedia: () => ({ matches: false }),
      })
    ).toBe(true);
  });
});
