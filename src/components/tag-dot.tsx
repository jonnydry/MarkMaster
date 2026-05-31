import { getTagDotVariant } from "@/lib/tag-colors";
import { cn } from "@/lib/utils";

const VARIANT_COUNT = 64;
const COLS = 8;
const NATIVE_CELL = 32; // px in the 256×256 source PNG
const SHEET_PX = COLS * NATIVE_CELL; // 256

export interface TagDotProps {
  name: string;
  color?: string; // 404 / missing-image fallback only (the sprite sheet is fully opaque RGB)
  size?: 6 | 8 | 10 | 12 | 14 | 16; // matches all current usages across the app
  className?: string;
  title?: string; // optional tooltip (currently unused)
}

/**
 * Pixel-art "agent dot" indicator used for tags throughout the interface.
 *
 * The sprite sheet (public/tag-icons/pixel-agent-dots.png) is a 256×256 grid
 * (8×8 of 32px cells) that has been specifically optimized with bolder, chunkier
 * internal features so the icons remain legible and distinct when heavily
 * downscaled to the tiny sizes used in the UI (especially 6px in sidebars and
 * 8px in pills).
 *
 * Visual expectations by size:
 * - 6px (sidebar, some pills): Very small. You will mostly see colored blobs
 *   with texture and a dark ring. Fine dither details from the sprite are lost
 *   (expected at ~5.3× downscale). Still clearly different per tag.
 * - 8px: Good balance — patterns are recognizable.
 * - 12-14px (settings rows, command palette): Best fidelity. Most of the
 *   chunky pixel art detail and variety is visible.
 *
 * The backgroundColor prop is strictly a fallback for 404/missing image cases
 * and does not tint the sprite (the PNG is fully opaque).
 */

export function TagDot({
  name,
  color = "#64748b",
  size = 8,
  className,
  title,
}: TagDotProps) {
  const variant = getTagDotVariant(name, VARIANT_COUNT);
  const col = variant % COLS;
  const row = Math.floor(variant / COLS);
  const px = size;

  const scale = px / NATIVE_CELL; // e.g. 8/32 = 0.25
  const scaledSheet = SHEET_PX * scale;

  const bgPosX = -(col * px);
  const bgPosY = -(row * px);

  return (
    <span
      className={cn(
        "inline-block shrink-0 overflow-hidden rounded-full",
        className
      )}
      style={{
        width: px,
        height: px,
        backgroundColor: color, // 404 / missing-image fallback only (PNG is fully opaque RGB)
        backgroundImage: `url('/tag-icons/pixel-agent-dots.png')`,
        backgroundSize: `${scaledSheet}px ${scaledSheet}px`,
        backgroundPosition: `${bgPosX}px ${bgPosY}px`,
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
      }}
      aria-hidden
      title={title}
    />
  );
}
