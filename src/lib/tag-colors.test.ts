import { describe, expect, it } from "vitest";

import { PRESET_COLORS } from "@/lib/constants";
import {
  assignBalancedTagColors,
  getBalancedTagColor,
  getTagColorSpectrum,
  normalizeTagColor,
} from "@/lib/tag-colors";

describe("tag color helpers", () => {
  it("normalizes valid hex colors", () => {
    expect(normalizeTagColor("#ABCDEF")).toBe("#abcdef");
    expect(normalizeTagColor("blue")).toBeNull();
    expect(normalizeTagColor(null)).toBeNull();
  });

  it("avoids overused colors when picking a new tag color", () => {
    const color = getBalancedTagColor("Recipes", [
      { name: "AI", color: PRESET_COLORS[0] },
      { name: "Tools", color: PRESET_COLORS[0] },
      { name: "Research", color: PRESET_COLORS[1] },
    ]);

    expect(color).not.toBe(PRESET_COLORS[0]);
  });

  it("generates expansion waves beyond the base swatches", () => {
    const spectrum = getTagColorSpectrum(PRESET_COLORS.length + 8);

    expect(spectrum.slice(0, PRESET_COLORS.length)).toEqual(PRESET_COLORS);
    expect(spectrum).toHaveLength(PRESET_COLORS.length + 8);
    expect(new Set(spectrum).size).toBe(spectrum.length);
  });

  it("picks generated colors after the base spectrum is occupied", () => {
    const color = getBalancedTagColor(
      "Expanded Topic",
      PRESET_COLORS.map((presetColor, index) => ({
        name: `Existing ${index}`,
        color: presetColor,
      }))
    );

    expect(PRESET_COLORS).not.toContain(color);
  });

  it("spreads a tag set across the palette before repeating", () => {
    const tags = Array.from({ length: PRESET_COLORS.length + 12 }, (_, index) => ({
      id: `tag-${index}`,
      name: `Tag ${index}`,
      color: PRESET_COLORS[0],
    }));

    const assigned = assignBalancedTagColors(tags);
    const uniqueColors = new Set(assigned.map((tag) => tag.color));

    expect(uniqueColors.size).toBe(tags.length);
  });
});
