import { describe, expect, it } from "vitest";

import { getOrbitMapBackgroundTint } from "@/lib/orbit-map-palette";

describe("getOrbitMapBackgroundTint", () => {
  it("uses the neutral app background in dark mode", () => {
    expect(getOrbitMapBackgroundTint("dark")).toBe("#0a0a0a");
  });

  it("uses the app's surface colour in light mode", () => {
    expect(getOrbitMapBackgroundTint("light")).toBe("#f7f8f9");
  });
});
