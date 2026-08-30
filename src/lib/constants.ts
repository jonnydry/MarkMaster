export const PRESET_COLORS = [
  "#1d9bf0",
  "#06b6d4",
  "#14b8a6",
  "#10b981",
  "#84cc16",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#ec4899",
  "#a855f7",
  "#8b5cf6",
  "#6366f1",
  "#71717a",
];

/** Human-readable names for the preset palette (screen-reader labels). */
const PRESET_COLOR_NAMES: Record<string, string> = {
  "#1d9bf0": "Blue",
  "#06b6d4": "Cyan",
  "#14b8a6": "Teal",
  "#10b981": "Emerald",
  "#84cc16": "Lime",
  "#f59e0b": "Amber",
  "#f97316": "Orange",
  "#ef4444": "Red",
  "#ec4899": "Pink",
  "#a855f7": "Purple",
  "#8b5cf6": "Violet",
  "#6366f1": "Indigo",
  "#71717a": "Gray",
};

/** Name for a preset color, falling back to the raw hex for unknown values. */
export function getColorName(color: string): string {
  return PRESET_COLOR_NAMES[color.toLowerCase()] ?? color;
}

export const TWITTER_PROVIDER_ID = "twitter";
