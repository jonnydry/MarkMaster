import { describe, expect, it } from "vitest";
import {
  DEFAULT_TYPOGRAPHY_PRESET,
  TYPOGRAPHY_PRESETS,
  getTypographyPreset,
  isTypographyPresetId,
  resolveTypographyPreset,
} from "./typography-presets";

describe("typography presets", () => {
  it("defaults to the Orbit typography system", () => {
    expect(resolveTypographyPreset(null, null)).toBe(DEFAULT_TYPOGRAPHY_PRESET);
  });

  it("migrates the legacy monospace font mode", () => {
    expect(resolveTypographyPreset(null, "mono")).toBe("mono");
  });

  it("validates known preset ids", () => {
    for (const preset of TYPOGRAPHY_PRESETS) {
      expect(isTypographyPresetId(preset.id)).toBe(true);
      expect(getTypographyPreset(preset.id).name).toBe(preset.name);
    }
    expect(isTypographyPresetId("default")).toBe(false);
    expect(isTypographyPresetId("invalid")).toBe(false);
  });
});
