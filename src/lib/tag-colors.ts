import { PRESET_COLORS } from "@/lib/constants";

type TagColorPeer = {
  name?: string | null;
  color?: string | null;
};

type RecolorableTag = {
  id: string;
  name: string;
  color: string;
};

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const MIN_GENERATED_LIGHTNESS = 38;
const MAX_GENERATED_LIGHTNESS = 66;
const MIN_GENERATED_SATURATION = 42;
const MAX_GENERATED_SATURATION = 88;

const TAG_COLOR_WAVES = [
  { hue: 0, saturation: 0, lightness: 0 },
  { hue: 8, saturation: -6, lightness: -9 },
  { hue: -8, saturation: -8, lightness: 9 },
  { hue: 16, saturation: 4, lightness: -15 },
  { hue: -16, saturation: -12, lightness: 15 },
  { hue: 24, saturation: 8, lightness: -20 },
  { hue: -24, saturation: -16, lightness: 20 },
] as const;

function normalizeKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function hashString(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (channel: number) =>
    clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: lightness * 100 };
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;

  if (max === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0);
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  return { h: hue * 60, s: saturation * 100, l: lightness * 100 };
}

function hslToRgb(h: number, s: number, l: number) {
  const hue = (((h % 360) + 360) % 360) / 360;
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;

  if (saturation === 0) {
    const value = lightness * 255;
    return { r: value, g: value, b: value };
  }

  const hueToRgb = (p: number, q: number, t: number) => {
    let adjusted = t;
    if (adjusted < 0) adjusted += 1;
    if (adjusted > 1) adjusted -= 1;
    if (adjusted < 1 / 6) return p + (q - p) * 6 * adjusted;
    if (adjusted < 1 / 2) return q;
    if (adjusted < 2 / 3) return p + (q - p) * (2 / 3 - adjusted) * 6;
    return p;
  };

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return {
    r: hueToRgb(p, q, hue + 1 / 3) * 255,
    g: hueToRgb(p, q, hue) * 255,
    b: hueToRgb(p, q, hue - 1 / 3) * 255,
  };
}

function shiftColor(baseColor: string, waveIndex: number) {
  const normalized = normalizeTagColor(baseColor);
  if (!normalized || waveIndex === 0) return normalized;

  const hsl = rgbToHsl(hexToRgb(normalized));
  const wave = TAG_COLOR_WAVES[waveIndex % TAG_COLOR_WAVES.length];
  const lap = Math.floor(waveIndex / TAG_COLOR_WAVES.length);
  const saturation =
    hsl.s < 12
      ? clamp(10 + lap * 2, 8, 18)
      : clamp(
          hsl.s + wave.saturation - lap * 4,
          MIN_GENERATED_SATURATION,
          MAX_GENERATED_SATURATION
        );
  const lightness = clamp(
    hsl.l + wave.lightness + (lap % 2 === 0 ? 0 : -6),
    MIN_GENERATED_LIGHTNESS,
    MAX_GENERATED_LIGHTNESS
  );
  const hue = hsl.h + wave.hue + lap * 31;
  const rgb = hslToRgb(hue, saturation, lightness);

  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

export function normalizeTagColor(value: string | null | undefined) {
  return value && HEX_COLOR_PATTERN.test(value) ? value.toLowerCase() : null;
}

export function getTagColorSpectrum(size: number) {
  const targetSize = Math.max(1, Math.ceil(size));
  const colors: string[] = [];
  const seen = new Set<string>();
  let waveIndex = 0;

  while (colors.length < targetSize) {
    for (const baseColor of PRESET_COLORS) {
      const color = shiftColor(baseColor, waveIndex);
      if (!color || seen.has(color)) continue;
      seen.add(color);
      colors.push(color);
      if (colors.length >= targetSize) break;
    }
    waveIndex += 1;
  }

  return colors;
}

function countPaletteColors(
  tags: readonly TagColorPeer[],
  palette: readonly string[]
) {
  const counts = new Map(palette.map((color) => [color, 0]));
  for (const tag of tags) {
    const color = normalizeTagColor(tag.color);
    if (!color || !counts.has(color)) continue;
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  return counts;
}

export function getBalancedTagColor(
  name: string,
  existingTags: readonly TagColorPeer[] = []
) {
  const palette = getTagColorSpectrum(existingTags.length + 1);
  const fallback = palette[0] ?? "#1d9bf0";

  const counts = countPaletteColors(existingTags, palette);
  const seed = normalizeKey(name) || "tag";
  const start = hashString(seed) % palette.length;
  let selected = palette[start] ?? fallback;
  let selectedCount = counts.get(selected) ?? 0;

  for (let offset = 0; offset < palette.length; offset += 1) {
    const candidate = palette[(start + offset) % palette.length] ?? fallback;
    const count = counts.get(candidate) ?? 0;
    if (count < selectedCount) {
      selected = candidate;
      selectedCount = count;
      if (count === 0) break;
    }
  }

  return selected;
}

export function assignBalancedTagColors<TTag extends RecolorableTag>(
  tags: readonly TTag[]
) {
  const palette = getTagColorSpectrum(tags.length || 1);
  const assigned: TagColorPeer[] = [];
  const assignedColorById = new Map<string, string>();
  const sortedTags = [...tags].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  for (const tag of sortedTags) {
    const color = getBalancedTagColor(tag.name, assigned);
    const nextColor =
      assigned.some((assignedTag) => assignedTag.color === color) &&
      assigned.length < palette.length
        ? palette.find(
            (candidate) =>
              !assigned.some((assignedTag) => assignedTag.color === candidate)
          ) ?? color
        : color;
    assigned.push({ name: tag.name, color: nextColor });
    assignedColorById.set(tag.id, nextColor);
  }

  return tags.map((tag) => ({
    ...tag,
    color: assignedColorById.get(tag.id) ?? tag.color,
  }));
}
