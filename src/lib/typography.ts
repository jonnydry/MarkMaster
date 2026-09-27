/**
 * Central typography contract for MarkMaster.
 *
 * monoNative is true when the Monospace typography preset is active.
 */

import type { TypographyPresetId } from "./typography-presets";

const MONO_LABEL = "text-mono-label tracking-[0.14em]";
const MONO_DATA = "text-mono-data tabular-nums";
const MONO_DISPLAY = "text-mono-display";
const MONO_SECTION_LABEL =
  "text-mono-label text-primary/60 tracking-[0.14em] mb-1.5";

/** Sentence-case field/control label — referenced by AGENTS.md design contract. */
export const SANS_LABEL = "text-xs font-medium text-muted-foreground";
const SANS_DATA = "tabular-nums text-foreground";
const SANS_SECTION_LABEL =
  "text-[13px] font-semibold text-muted-foreground mb-1.5";

export function resolveMonoNative(opts: {
  fontMode?: TypographyPresetId;
}): boolean {
  return opts.fontMode === "mono";
}

export type TypographyClasses = {
  monoNative: boolean;
  label: string;
  data: string;
  display: string;
  body: string;
  bodyStrong: string;
  chromeLabel: string;
  sectionLabel: string;
};

const MONO_BODY_STRONG =
  "font-[family-name:var(--font-ibm-plex-mono)] text-[13px] font-medium tracking-normal normal-case";
const SANS_BODY_STRONG = "text-[15px] font-medium";

export function getTypographyClasses(monoNative: boolean): TypographyClasses {
  return {
    monoNative,
    label: monoNative ? MONO_LABEL : SANS_LABEL,
    data: monoNative ? MONO_DATA : SANS_DATA,
    display: monoNative ? MONO_DISPLAY : "heading-font",
    body: "",
    bodyStrong: monoNative ? MONO_BODY_STRONG : SANS_BODY_STRONG,
    chromeLabel: monoNative ? "app-chrome-label" : "",
    sectionLabel: monoNative ? MONO_SECTION_LABEL : SANS_SECTION_LABEL,
  };
}

/** Shared mono typography tokens for elevated panel components. */
export const orbitalTypography = {
  label: MONO_LABEL,
  data: MONO_DATA,
  sectionLabel: MONO_SECTION_LABEL,
} as const;

/** Post-text presets for bookmark cards — one source of truth across view modes. */
export const FEED_POST_TEXT = "text-[15px] leading-6 text-foreground whitespace-pre-wrap";
export const GRID_POST_TEXT_MEDIA = "text-sm leading-5 text-foreground";
export const GRID_POST_TEXT_ONLY = "text-[15px] font-medium leading-6 text-foreground";
