"use client";

import { useCallback, useId, useMemo } from "react";

export interface SimpleAreaChartPoint {
  label: string;
  count: number;
}

interface SimpleAreaChartProps {
  data: SimpleAreaChartPoint[];
  /** Width of the SVG in px. */
  width?: number;
  /** Height of the SVG in px. */
  height?: number;
  /** Max number of x-axis labels to render. */
  maxXLabels?: number;
  /** Highlight a specific point by label. */
  highlightLabel?: string | null;
  highlightColor?: string;
}

const MARGIN = { top: 8, right: 12, bottom: 24, left: 32 };
const TICK_LENGTH = 4;

export function SimpleAreaChart({
  data,
  width = 600,
  height = 220,
  maxXLabels = 6,
  highlightLabel,
  highlightColor = "var(--note)",
}: SimpleAreaChartProps) {
  const gradientId = useId().replace(/:/g, "");

  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;

  const maxCount = useMemo(
    () => Math.max(1, ...data.map((d) => d.count)),
    [data]
  );

  const xScale = useCallback(
    (index: number) =>
      data.length <= 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth,
    [data.length, innerWidth]
  );

  const yScale = useCallback(
    (count: number) => innerHeight - (count / maxCount) * innerHeight,
    [innerHeight, maxCount]
  );

  const areaPath = useMemo(() => {
    if (data.length === 0) return "";
    const topPoints = data.map((d, i) => [xScale(i), yScale(d.count)]);
    return `M ${topPoints[0][0]},${innerHeight} L ${topPoints
      .map((p) => `${p[0]},${p[1]}`)
      .join(" L ")} L ${topPoints[topPoints.length - 1][0]},${innerHeight} Z`;
  }, [data, innerHeight, xScale, yScale]);

  const linePath = useMemo(() => {
    if (data.length === 0) return "";
    const points = data.map((d, i) => [xScale(i), yScale(d.count)]);
    if (points.length === 1) {
      return `M ${points[0][0]},${points[0][1]}`;
    }
    // Simple catmull-rom-like smoothing for monotone curves.
    const d: string[] = [`M ${points[0][0]},${points[0][1]}`];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d.push(`C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`);
    }
    return d.join(" ");
  }, [data, xScale, yScale]);

  const yTicks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) =>
      Math.round((maxCount / count) * i)
    );
  }, [maxCount]);

  const xLabels = useMemo(() => {
    if (data.length <= maxXLabels) return data.map((d, i) => ({ label: d.label, index: i }));
    const step = Math.ceil(data.length / maxXLabels);
    return data
      .map((d, i) => ({ label: d.label, index: i }))
      .filter((_, i) => i % step === 0 || i === data.length - 1);
  }, [data, maxXLabels]);

  const highlightPoint = useMemo(() => {
    if (!highlightLabel) return null;
    const index = data.findIndex((d) => d.label === highlightLabel);
    if (index < 0) return null;
    return { x: xScale(index), y: yScale(data[index].count), count: data[index].count };
  }, [data, highlightLabel, xScale, yScale]);

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Bookmarks over time area chart"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.32} />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
        </linearGradient>
      </defs>

      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {/* Horizontal grid lines */}
        {yTicks.map((tick, i) => {
          const y = yScale(tick);
          return (
            <line
              key={i}
              x1={0}
              x2={innerWidth}
              y1={y}
              y2={y}
              stroke="var(--hairline-soft)"
              strokeDasharray="3 3"
            />
          );
        })}

        {/* Y-axis ticks and labels */}
        {yTicks.map((tick, i) => {
          const y = yScale(tick);
          return (
            <g key={`y-${i}`}>
              <line
                x1={-TICK_LENGTH}
                x2={0}
                y1={y}
                y2={y}
                stroke="var(--muted-foreground)"
              />
              <text
                x={-8}
                y={y}
                dy="0.32em"
                textAnchor="end"
                fill="var(--muted-foreground)"
                fontSize={11}
                fontFamily="var(--font-sans)"
              >
                {tick.toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {xLabels.map(({ label, index }) => (
          <text
            key={label}
            x={xScale(index)}
            y={innerHeight + 16}
            textAnchor="middle"
            fill="var(--muted-foreground)"
            fontSize={11}
            fontFamily="var(--font-sans)"
          >
            {label}
          </text>
        ))}

        {/* Area */}
        {areaPath && (
          <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        )}

        {/* Line */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={2.25}
          />
        )}

        {/* Highlight dot */}
        {highlightPoint && (
          <circle
            cx={highlightPoint.x}
            cy={highlightPoint.y}
            r={5}
            fill={highlightColor}
            stroke="var(--surface-1)"
            strokeWidth={2}
          />
        )}
      </g>
    </svg>
  );
}
