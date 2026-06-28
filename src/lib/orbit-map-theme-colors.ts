import { getColorTheme, type ColorThemeId } from "@/lib/color-themes";
import {
  getOrbitMapBackgroundTint,
  type OrbitMapColorMode,
} from "@/lib/orbit-map-palette";
import { readPrimaryAccentHex } from "@/lib/read-primary-accent";

export type OrbitMapCanvasTheme = {
  accentHex: string;
  backgroundHex: string;
};

/** Resolve accent + tinted canvas background for the active app theme. */
export function resolveOrbitMapCanvasTheme(
  mode: OrbitMapColorMode,
  colorTheme: ColorThemeId
): OrbitMapCanvasTheme {
  const accentHex =
    readPrimaryAccentHex() ?? getColorTheme(colorTheme).swatch;
  const backgroundHex = getOrbitMapBackgroundTint(mode, accentHex);
  return { accentHex, backgroundHex };
}
