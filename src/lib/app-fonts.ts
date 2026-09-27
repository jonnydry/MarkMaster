import localFont from "next/font/local";

import type { TypographyPresetId } from "@/lib/typography-presets";

/**
 * Self-hosted latin files. next/font/google downloads a stylesheet at build
 * time, and Turbopack rejects the build when Google returns extensionless
 * `/l/font?kit=` URLs: the `&` in that query is parsed as extra font-file
 * entries ("next/font/google queries have exactly one entry").
 */

/** Orbit (default) preset — Geist for UI and reading, Geist Mono for data. */
const geistSans = localFont({
  src: "./fonts/geist-sans-latin.woff2",
  weight: "100 900",
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  weight: "100 900",
  variable: "--font-geist-mono",
});

/** Mono + editorial presets — declared globally, not preloaded. */
const ibmPlexSans = localFont({
  src: "./fonts/ibm-plex-sans-latin.woff2",
  weight: "400 700",
  variable: "--font-ibm-plex-sans",
  preload: false,
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  weight: "400 700",
  variable: "--font-jetbrains-mono",
  preload: false,
});

const ibmPlexMono = localFont({
  src: [
    {
      path: "./fonts/ibm-plex-mono-latin-400.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/ibm-plex-mono-latin-500.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/ibm-plex-mono-latin-600.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/ibm-plex-mono-latin-700.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-ibm-plex-mono",
  preload: false,
});

/** Classic preset — lazy-loaded when selected. */
const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "100 900",
  variable: "--font-inter",
  preload: false,
});

const dmSans = localFont({
  src: "./fonts/dm-sans-latin.woff2",
  weight: "400 900",
  variable: "--font-dm-sans",
  preload: false,
});

/** Editorial preset — lazy-loaded when selected. */
const sourceSerif = localFont({
  src: "./fonts/source-serif-4-latin.woff2",
  weight: "200 900",
  variable: "--font-source-serif",
  preload: false,
});

const newsreader = localFont({
  src: "./fonts/newsreader-latin.woff2",
  weight: "200 800",
  variable: "--font-newsreader",
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
