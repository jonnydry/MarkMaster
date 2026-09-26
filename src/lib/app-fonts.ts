import {
  DM_Sans,
  Geist,
  Geist_Mono,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Inter,
  JetBrains_Mono,
  Newsreader,
  Source_Serif_4,
} from "next/font/google";

import type { TypographyPresetId } from "@/lib/typography-presets";

/** Orbit (default) preset — Geist for UI and reading, Geist Mono for data. */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Mono + editorial presets — declared globally, not preloaded. */
const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  preload: false,
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  preload: false,
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  preload: false,
});

/** Classic preset — lazy-loaded when selected. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  preload: false,
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  preload: false,
});

/** Editorial preset — lazy-loaded when selected. */
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  preload: false,
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  preload: false,
});

export const defaultFontVariables = [
  geistSans.variable,
  geistMono.variable,
  ibmPlexSans.variable,
  jetbrainsMono.variable,
  ibmPlexMono.variable,
].join(" ");

const PRESET_FONT_VARIABLES: Record<TypographyPresetId, string[]> = {
  orbit: [],
  classic: [inter.variable, dmSans.variable],
  editorial: [sourceSerif.variable, newsreader.variable],
  mono: [],
};

export function fontVariablesForPreset(preset: TypographyPresetId): string[] {
  return PRESET_FONT_VARIABLES[preset];
}
