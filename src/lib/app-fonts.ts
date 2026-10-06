import localFont from "next/font/local";

import type { TypographyPresetId } from "@/lib/typography-presets";

/**
 * Self-hosted latin files. next/font/google downloads a stylesheet at build
 * time, and Turbopack rejects the build when Google returns extensionless
 * `/l/font?kit=` URLs: the `&` in that query is parsed as extra font-file
 * entries ("next/font/google queries have exactly one entry").
 *
 * Berkeley Mono WOFF2 files are the licensed web compile. They ship with the
 * app so production builds can serve them, and they are excluded from the
 * MIT license. See src/lib/fonts/berkeley-mono-license.txt.
 */

/** Sans preset — Geist for UI and reading, Geist Mono for data. */
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

/** Serif preset — loaded when that preset is shown or selected. */
const sourceSerif = localFont({
  src: "./fonts/source-serif-4-latin.woff2",
  weight: "200 900",
  variable: "--font-source-serif",
  preload: false,
});

/**
 * Mono preset. The web compile is Regular and Bold, so medium stays on
 * Regular and semibold uses Bold. Declared on the document, not preloaded.
 */
const berkeleyMono = localFont({
  src: [
    {
      path: "./fonts/berkeley-mono-regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/berkeley-mono-bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "./fonts/berkeley-mono-oblique.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "./fonts/berkeley-mono-bold-oblique.woff2",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-berkeley-mono",
  fallback: ["ui-monospace", "SFMono-Regular", "monospace"],
  adjustFontFallback: false,
  preload: false,
});

export const defaultFontVariables = [
  geistSans.variable,
  geistMono.variable,
  berkeleyMono.variable,
].join(" ");

const PRESET_FONT_VARIABLES: Record<TypographyPresetId, string[]> = {
  orbit: [],
  serif: [sourceSerif.variable],
  mono: [],
};

export function fontVariablesForPreset(preset: TypographyPresetId): string[] {
  return PRESET_FONT_VARIABLES[preset];
}
