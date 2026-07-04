export const COLOR_THEME_IDS = [
  "horizon",
  "aurora",
  "ember",
  "nebula",
  "canopy",
  "pulse",
  "graphite",
] as const;

export type ColorThemeId = (typeof COLOR_THEME_IDS)[number];

export type ColorThemeOption = {
  id: ColorThemeId;
  name: string;
  description: string;
  swatch: string;
};

/** Accent palettes layered on the default light/dark surfaces. */
export const COLOR_THEMES: ColorThemeOption[] = [
  {
    id: "horizon",
    name: "Horizon",
    description: "Classic cobalt — the default MarkMaster blue",
    swatch: "#2563eb",
  },
  {
    id: "aurora",
    name: "Aurora",
    description: "Polar teal — cool northern lights energy",
    swatch: "#2dd4bf",
  },
  {
    id: "ember",
    name: "Ember",
    description: "Solar flare orange — warm and vivid",
    swatch: "#fb923c",
  },
  {
    id: "nebula",
    name: "Nebula",
    description: "Deep-space violet — cosmic and refined",
    swatch: "#a78bfa",
  },
  {
    id: "canopy",
    name: "Canopy",
    description: "Forest canopy green — grounded and fresh",
    swatch: "#4ade80",
  },
  {
    id: "pulse",
    name: "Pulse",
    description: "Cherry nebula rose — bold and electric",
    swatch: "#f472b6",
  },
  {
    id: "graphite",
    name: "Graphite",
    description: "Monochrome — black, white, and steel grays",
    swatch: "#71717a",
  },
];

const COLOR_THEME_SET = new Set<string>(COLOR_THEME_IDS);

export function isColorThemeId(value: string | null | undefined): value is ColorThemeId {
  return !!value && COLOR_THEME_SET.has(value);
}

export function resolveColorTheme(
  stored: string | null,
  legacyOrbital: boolean
): ColorThemeId {
  if (isColorThemeId(stored)) return stored;
  if (legacyOrbital) return "aurora";
  return "horizon";
}

export function getColorTheme(id: ColorThemeId): ColorThemeOption {
  return COLOR_THEMES.find((theme) => theme.id === id) ?? COLOR_THEMES[0];
}
