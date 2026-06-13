import {
  DM_Sans,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Instrument_Sans,
  Inter,
  JetBrains_Mono,
} from "next/font/google";

import type { TypographyPresetId } from "@/lib/typography-presets";

/** Orbit (default) + mono preset — loaded globally in root layout. */
export const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/** Classic preset — lazy-loaded when selected. */
export const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  preload: false,
});

export const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  preload: false,
});

/** Editorial preset — lazy-loaded when selected. */
export const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  preload: false,
});

export const defaultFontVariables = [
  ibmPlexSans.variable,
  jetbrainsMono.variable,
  ibmPlexMono.variable,
].join(" ");

const PRESET_FONT_VARIABLES: Record<TypographyPresetId, string[]> = {
  orbit: [],
  classic: [inter.variable, dmSans.variable],
  editorial: [instrumentSans.variable],
  mono: [],
};

export function fontVariablesForPreset(preset: TypographyPresetId): string[] {
  return PRESET_FONT_VARIABLES[preset];
}
