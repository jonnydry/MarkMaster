const TYPOGRAPHY_PRESET_IDS = ["orbit", "serif", "mono"] as const;

export type TypographyPresetId = (typeof TYPOGRAPHY_PRESET_IDS)[number];

type TypographyPreset = {
  id: TypographyPresetId;
  name: string;
  description: string;
  bodyFace: string;
  headingFace: string;
  labelFace: string;
  dataFace: string;
  previewCopy: string;
};

export const DEFAULT_TYPOGRAPHY_PRESET: TypographyPresetId = "orbit";

export const TYPOGRAPHY_PRESETS: TypographyPreset[] = [
  {
    id: "orbit",
    name: "Sans",
    description: "Geist for the interface, Geist Mono for data.",
    bodyFace: "Geist",
    headingFace: "Geist",
    labelFace: "Geist",
    dataFace: "Geist Mono",
    previewCopy: "Clear reading with precise metadata.",
  },
  {
    id: "serif",
    name: "Serif",
    description: "Source Serif 4 for a slower reading pace.",
    bodyFace: "Source Serif 4",
    headingFace: "Source Serif 4",
    labelFace: "Source Serif 4",
    dataFace: "Source Serif 4",
    previewCopy: "Built for archives, essays, and close reading.",
  },
  {
    id: "mono",
    name: "Mono",
    description: "Berkeley Mono across the interface.",
    bodyFace: "Berkeley Mono",
    headingFace: "Berkeley Mono",
    labelFace: "Berkeley Mono",
    dataFace: "Berkeley Mono",
    previewCopy: "Tabular, compact, and highly scannable.",
  },
];

const TYPOGRAPHY_PRESET_SET = new Set<string>(TYPOGRAPHY_PRESET_IDS);

/** Retired picker ids, kept so a stored choice still resolves. */
const LEGACY_TYPOGRAPHY_PRESETS: Record<string, TypographyPresetId> = {
  classic: "orbit",
  editorial: "serif",
};

export function isTypographyPresetId(
  value: string | null | undefined
): value is TypographyPresetId {
  return !!value && TYPOGRAPHY_PRESET_SET.has(value);
}

export function resolveTypographyPreset(
  storedPreset: string | null | undefined,
  legacyFontMode?: string | null
): TypographyPresetId {
  if (isTypographyPresetId(storedPreset)) return storedPreset;
  if (storedPreset && storedPreset in LEGACY_TYPOGRAPHY_PRESETS) {
    return LEGACY_TYPOGRAPHY_PRESETS[storedPreset];
  }
  if (legacyFontMode === "mono") return "mono";
  return DEFAULT_TYPOGRAPHY_PRESET;
}

export function getTypographyPreset(
  id: TypographyPresetId
): TypographyPreset {
  return TYPOGRAPHY_PRESETS.find((preset) => preset.id === id) ?? TYPOGRAPHY_PRESETS[0];
}
