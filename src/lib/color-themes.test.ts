import { describe, expect, it } from "vitest";
import {
  COLOR_THEMES,
  getColorTheme,
  isColorThemeId,
  resolveColorTheme,
} from "./color-themes";

describe("color-themes", () => {
  it("resolves legacy orbital preference to aurora", () => {
    expect(resolveColorTheme(null, true)).toBe("aurora");
  });

  it("defaults to horizon when nothing is stored", () => {
    expect(resolveColorTheme(null, false)).toBe("horizon");
  });

  it("validates known theme ids", () => {
    for (const theme of COLOR_THEMES) {
      expect(isColorThemeId(theme.id)).toBe(true);
      expect(getColorTheme(theme.id).name).toBe(theme.name);
    }
    expect(isColorThemeId("invalid")).toBe(false);
  });
});
