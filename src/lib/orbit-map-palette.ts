export type OrbitMapColorMode = "light" | "dark";

export interface OrbitMapPalette {
  background: number;
  labelActive: number;
  labelNeighbor: number;
  labelDefault: number;
  linkFallback: number;
  linkHighlightMix: number;
  hubInnerStroke: number;
  accent: number;
  accentSoft: number;
}

export function parseHexColorToNumber(
  value: string | null | undefined,
  fallback: number
): number {
  const normalized = value?.replace("#", "").trim();
  if (!normalized) return fallback;
  // 6-digit: rrggbb
  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return Number.parseInt(normalized, 16);
  }
  // 3-digit shorthand: rgb
  if (/^[0-9a-fA-F]{3}$/.test(normalized)) {
    const r = normalized[0];
    const g = normalized[1];
    const b = normalized[2];
    return Number.parseInt(`${r}${r}${g}${g}${b}${b}`, 16);
  }
  return fallback;
}

function mixOrbitHex(colorA: number, colorB: number, amount: number): number {
  const a = Math.min(1, Math.max(0, amount));
  const r1 = (colorA >> 16) & 0xff;
  const g1 = (colorA >> 8) & 0xff;
  const b1 = colorA & 0xff;
  const r2 = (colorB >> 16) & 0xff;
  const g2 = (colorB >> 8) & 0xff;
  const b2 = colorB & 0xff;
  const r = Math.round(r1 * (1 - a) + r2 * a);
  const g = Math.round(g1 * (1 - a) + g2 * a);
  const b = Math.round(b1 * (1 - a) + b2 * a);
  return (r << 16) | (g << 8) | b;
}

function orbitHexToString(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
}

const MAP_CANVAS_BASE_DARK = 0x0a0a0a;
const MAP_CANVAS_BASE_LIGHT = 0xd8dce4;
const DEFAULT_ACCENT_DARK = 0x2f6fed;
const DEFAULT_ACCENT_SOFT_DARK = 0xbfdbfe;
const DEFAULT_ACCENT_LIGHT = 0x2563eb;
const DEFAULT_ACCENT_SOFT_LIGHT = 0x93c5fd;
/** Barely-there theme wash on space-black. */
const MAP_CANVAS_TINT_DARK = 0.04;
const MAP_CANVAS_TINT_LIGHT = 0.06;

/** Space-black / soft-gray canvas fill with a slight accent tint. */
export function getOrbitMapBackgroundTint(
  mode: OrbitMapColorMode,
  accentHex: string
): string {
  const isLight = mode === "light";
  const base = isLight ? MAP_CANVAS_BASE_LIGHT : MAP_CANVAS_BASE_DARK;
  const fallbackAccent = isLight ? DEFAULT_ACCENT_LIGHT : DEFAULT_ACCENT_DARK;
  const accent = parseHexColorToNumber(accentHex, fallbackAccent);
  const mixed = mixOrbitHex(
    base,
    accent,
    isLight ? MAP_CANVAS_TINT_LIGHT : MAP_CANVAS_TINT_DARK
  );
  return orbitHexToString(mixed);
}

export function getOrbitMapPalette(
  mode: OrbitMapColorMode,
  accentHex?: string | null,
  backgroundHex?: string | null
): OrbitMapPalette {
  const isLight = mode === "light";
  const defaultBackground = isLight ? MAP_CANVAS_BASE_LIGHT : MAP_CANVAS_BASE_DARK;
  const background = parseHexColorToNumber(backgroundHex, defaultBackground);

  const base = isLight
    ? {
        background,
        labelActive: 0x020617,
        labelNeighbor: 0x1e293b,
        labelDefault: 0x0f172a,
        linkFallback: 0x475569,
        linkHighlightMix: 0x020617,
        hubInnerStroke: 0xffffff,
      }
    : {
        background,
        labelActive: 0xf8fafc,
        labelNeighbor: 0xcbd5e1,
        labelDefault: 0xe2e8f0,
        linkFallback: 0x334155,
        linkHighlightMix: 0xffffff,
        hubInnerStroke: 0xffffff,
      };

  const hasAccent =
    typeof accentHex === "string" && accentHex.replace("#", "").trim().length > 0;

  const accent = hasAccent
    ? parseHexColorToNumber(accentHex, isLight ? DEFAULT_ACCENT_LIGHT : DEFAULT_ACCENT_DARK)
    : isLight
      ? DEFAULT_ACCENT_LIGHT
      : DEFAULT_ACCENT_DARK;

  const accentSoft = hasAccent
    ? mixOrbitHex(accent, 0xffffff, isLight ? 0.22 : 0.74)
    : isLight
      ? DEFAULT_ACCENT_SOFT_LIGHT
      : DEFAULT_ACCENT_SOFT_DARK;

  return { ...base, accent, accentSoft };
}

export function getOrbitMapLabelFill(
  palette: OrbitMapPalette,
  state: "active" | "neighbor" | "default"
): number {
  switch (state) {
    case "active":
      return palette.labelActive;
    case "neighbor":
      return palette.labelNeighbor;
    case "default":
      return palette.labelDefault;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}