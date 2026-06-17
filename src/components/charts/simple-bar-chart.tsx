"use client";

interface BarSegment {
  key: string;
  label: string;
  color: string;
  pct: number;
}

interface SimpleBarChartProps {
  segments: BarSegment[];
  /** Height of the SVG in px. */
  height?: number;
}

const RADIUS = 6;

export function SimpleBarChart({ segments, height = 44 }: SimpleBarChartProps) {
  const totalPct = segments.reduce((sum, s) => sum + s.pct, 0);
  const width = 100;
  const single = segments.length === 1;

  const bars = segments.reduce<{ x: number; w: number; segment: BarSegment }[]>(
    (acc, segment) => {
      const w = totalPct > 0 ? (segment.pct / totalPct) * width : 0;
      acc.push({ x: acc.reduce((sum, b) => sum + b.w, 0), w, segment });
      return acc;
    },
    []
  );

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Content mix bar chart"
    >
      {bars.map(({ x, w, segment }) => (
        <g key={segment.key}>
          <rect
            x={x}
            y={0}
            width={Math.max(0, w)}
            height={height}
            fill={segment.color}
            rx={single ? RADIUS : 0}
          />
          <title>{`${segment.label}: ${segment.pct.toFixed(0)}%`}</title>
        </g>
      ))}
    </svg>
  );
}
