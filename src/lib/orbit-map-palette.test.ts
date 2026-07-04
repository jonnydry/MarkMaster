import { describe, expect, it } from "vitest";

import { getOrbitMapPalette } from "@/lib/orbit-map-palette";

describe("getOrbitMapPalette", () => {
  it("uses backgroundHex for the canvas clear color", () => {
    const palette = getOrbitMapPalette("dark", "#fb923c", "#120c08");
    expect(palette.background).toBe(0x120c08);
    expect(palette.accent).toBe(0xfb923c);
  });

  it("falls back to defaults when backgroundHex is missing", () => {
    expect(getOrbitMapPalette("dark").background).toBe(0x0a0a0a);
    expect(getOrbitMapPalette("light").background).toBe(0xd8dce4);
  });
});
