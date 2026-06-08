export const TYPOGRAPHY_PRESET_IDS = [
  "orbit",
  "classic",
  "editorial",
  "mono",
] as const;

export type TypographyPresetId = (typeof TYPOGRAPHY_PRESET_IDS)[number];

export type TypographyPreset = {
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
    name: "Orbit",
    description: "Technical, readable, and a little less generic.",
    bodyFace: "IBM Plex Sans",
    headingFace: "IBM Plex Sans",
    labelFace: "IBM Plex Mono",
    dataFace: "JetBrains Mono",
    previewCopy: "Clear reading with precise metadata.",
  },
  {
    id: "classic",
    name: "Classic",
    description: "The current crisp app feel, kept as an option.",
    bodyFace: "Inter",
    headingFace: "DM Sans",
    labelFace: "Inter",
    dataFace: "JetBrains Mono",
    previewCopy: "Neutral SaaS clarity and familiar spacing.",
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "A softer, more human sans family for longer sessions.",
    bodyFace: "Instrument Sans",
    headingFace: "Instrument Sans",
    labelFace: "Instrument Sans",
    dataFace: "IBM Plex Mono",
    previewCopy: "Warmer texture without getting loud.",
  },
  {
    id: "mono",
    name: "Monospace",
    description: "Terminal-native chrome for dense review work.",
    bodyFace: "JetBrains Mono",
    headingFace: "JetBrains Mono",
    labelFace: "IBM Plex Mono",
    dataFace: "JetBrains Mono",
    previewCopy: "Tabular, compact, and highly scannable.",
  },
];

const TYPOGRAPHY_PRESET_SET = new Set<string>(TYPOGRAPHY_PRESET_IDS);

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
  if (legacyFontMode === "mono") return "mono";
  return DEFAULT_TYPOGRAPHY_PRESET;
}

export function getTypographyPreset(
  id: TypographyPresetId
): TypographyPreset {
  return TYPOGRAPHY_PRESETS.find((preset) => preset.id === id) ?? TYPOGRAPHY_PRESETS[0];
}
