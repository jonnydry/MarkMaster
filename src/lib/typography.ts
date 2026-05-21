/**
 * Central typography contract for MarkMaster.
 *
 * monoNative is true when either:
 * - Monospace UI toggle is on (`fontMode === "mono"`), or
 * - Orbit Theme is enabled (`isOrbital` / `.theme-orbital` on `html`).
 *
 * The /orbit route does not force mono; use orbit-route-chrome for blue-default chrome there.
 */

export const MONO_LABEL = "text-mono-label tracking-[0.14em]";
export const MONO_DATA = "text-mono-data tabular-nums";
export const MONO_DISPLAY = "text-mono-display";
export const MONO_SECTION_LABEL =
  "text-mono-label text-primary/60 tracking-[0.16em] mb-1.5";

export const SANS_LABEL =
  "text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground";
export const SANS_DATA = "tabular-nums text-foreground";
export const SANS_SECTION_LABEL =
  "text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5";

export type FontMode = "default" | "mono";

export function resolveMonoNative(opts: {
  fontMode?: FontMode;
  isOrbital?: boolean;
}): boolean {
  return opts.fontMode === "mono" || !!opts.isOrbital;
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

/** Orbital surface tokens — mono tier classes apply under .theme-orbital (Orbit theme toggle). */
export const orbitalTypography = {
  label: MONO_LABEL,
  data: MONO_DATA,
  sectionLabel: MONO_SECTION_LABEL,
} as const;

/** Semibold nav / list titles when monoNative (IBM Plex, normal case). */
export const MONO_BODY_STRONG =
  "font-[family-name:var(--font-ibm-plex-mono)] text-[13px] font-medium tracking-normal normal-case";
export const SANS_BODY_STRONG = "text-[15px] font-medium";
