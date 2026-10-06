import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";

import type { TypographyPresetId } from "@/lib/typography-presets";

/**
 * Geist and Source Serif 4 stay as self-hosted latin files. next/font/google
 * downloads a stylesheet at build time, and Turbopack rejects the build when
 * Google returns extensionless `/l/font?kit=` URLs: the `&` in that query is
 * parsed as extra font-file entries ("next/font/google queries have exactly
 * one entry").
 *
 * JetBrains Mono is the exception: the Mono preset loads it through
 * next/font/google (OFL) so no mono font files are committed. It falls back
 * to ui-monospace, then the usual monospace stack.
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
 * Mono preset, and the data/code face of the Serif preset.
 * Declared on the document, not preloaded.
 */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-jetbrains-mono",
  fallback: ["ui-monospace", "SFMono-Regular", "monospace"],
  preload: false,
});

export const defaultFontVariables = [
  geistSans.variable,
  geistMono.variable,
  jetbrainsMono.variable,
].join(" ");

const PRESET_FONT_VARIABLES: Record<TypographyPresetId, string[]> = {
  orbit: [],
  serif: [sourceSerif.variable],
  mono: [],
};

export function fontVariablesForPreset(preset: TypographyPresetId): string[] {
  return PRESET_FONT_VARIABLES[preset];
}
