import { describe, expect, it } from "vitest";
import {
  DEFAULT_TYPOGRAPHY_PRESET,
  TYPOGRAPHY_PRESETS,
  getTypographyPreset,
  isTypographyPresetId,
  resolveTypographyPreset,
} from "./typography-presets";

describe("typography presets", () => {
  it("defaults to the Sans typography system", () => {
    expect(resolveTypographyPreset(null, null)).toBe(DEFAULT_TYPOGRAPHY_PRESET);
    expect(getTypographyPreset(DEFAULT_TYPOGRAPHY_PRESET).name).toBe("Sans");
  });

  it("migrates the legacy monospace font mode", () => {
    expect(resolveTypographyPreset(null, "mono")).toBe("mono");
  });

  it("folds retired presets into the three remaining choices", () => {
    expect(resolveTypographyPreset("classic", null)).toBe("orbit");
    expect(resolveTypographyPreset("editorial", null)).toBe("serif");
  });

  it("offers sans, serif, and mono", () => {
    expect(TYPOGRAPHY_PRESETS.map((preset) => preset.id)).toEqual([
      "orbit",
      "serif",
      "mono",
    ]);
    for (const preset of TYPOGRAPHY_PRESETS) {
      expect(isTypographyPresetId(preset.id)).toBe(true);
      expect(getTypographyPreset(preset.id).name).toBe(preset.name);
    }
    expect(isTypographyPresetId("classic")).toBe(false);
    expect(isTypographyPresetId("editorial")).toBe(false);
    expect(isTypographyPresetId("invalid")).toBe(false);
  });

  it("uses one reading face for serif and JetBrains Mono for data and the mono preset", () => {
    const serif = getTypographyPreset("serif");
    const mono = getTypographyPreset("mono");

    expect(serif.bodyFace).toBe("Source Serif 4");
    expect(serif.headingFace).toBe(serif.bodyFace);
    expect(serif.labelFace).toBe(serif.bodyFace);
    expect(serif.dataFace).toBe("JetBrains Mono");
    expect(mono.bodyFace).toBe("JetBrains Mono");
    expect(mono.dataFace).toBe("JetBrains Mono");
  });
});
