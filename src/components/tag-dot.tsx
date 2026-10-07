import {
  TAG_MARK_DIM_ALPHA,
  TAG_ORBIT_DISC,
  getTagOrbitGeometry,
  tagOrbitArcPath,
  tagOrbitViewOrigin,
} from "@/lib/tag-mark";
import { cn } from "@/lib/utils";

export interface TagDotProps {
  name: string;
  color?: string;
  size?: 6 | 8 | 10 | 12 | 14 | 16;
  className?: string;
  title?: string;
}

/**
 * The tag orbit used everywhere a tag is named. The map draws the same trace
 * on tag hubs.
 */
export function TagDot({
  name,
  color = "#64748b",
  size = 8,
  className,
  title,
}: TagDotProps) {
  const mark = getTagOrbitGeometry(name, TAG_ORBIT_DISC);
  const origin = tagOrbitViewOrigin();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={cn("inline-block shrink-0 rounded-full", className)}
      aria-hidden
    >
      {title ? <title>{title}</title> : null}
      <circle
        cx={origin}
        cy={origin}
        r={mark.discRadius}
        fill={color}
        opacity={TAG_MARK_DIM_ALPHA}
      />
      <path
        d={tagOrbitArcPath(origin, origin, mark.arcRadius, mark.start, mark.end)}
        fill="none"
        stroke={color}
        strokeWidth={mark.arcWidth}
        strokeLinecap="butt"
      />
      <rect
        x={origin + mark.head.x}
        y={origin + mark.head.y}
        width={mark.head.size}
        height={mark.head.size}
        fill={color}
      />
    </svg>
  );
}
