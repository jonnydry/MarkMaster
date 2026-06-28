import { describe, expect, it } from "vitest";

import { getOrbitMapBackgroundTint } from "@/lib/orbit-map-palette";

describe("getOrbitMapBackgroundTint", () => {
  it("warms space-black for ember dark mode", () => {
    const tint = getOrbitMapBackgroundTint("dark", "#fb923c");
    expect(tint).not.toBe("#0a0a0a");
    expect(tint).toMatch(/^#[0-9a-f]{6}$/);
    // Red channel should rise vs neutral base #0a0a0a
    expect(Number.parseInt(tint.slice(1, 3), 16)).toBeGreaterThan(0x0a);
  });

  it("keeps light mode close to the soft gray base", () => {
    const tint = getOrbitMapBackgroundTint("light", "#2563eb");
    expect(tint).not.toBe("#f4f5f7");
  });
});
