"use client";

import React, { useMemo } from "react";
import { Layers } from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AnalyticsData } from "@/types";

import {
  analyticsChartSurfaceCardClass,
  analyticsChartSurfaceClass,
} from "./analytics-primitives";
import {
  ChartShell,
  EmptyBox,
  SectionHeading,
  type ChartVariant,
} from "./analytics-chart-shell";

const MIX_SERIES: Array<{ key: string; color: string; label: string }> = [
  { key: "Media", color: "var(--chart-1)", label: "Media" },
  { key: "Media + Links", color: "var(--chart-4)", label: "Media + links" },
  { key: "Links", color: "var(--chart-3)", label: "Links" },
  { key: "Text Only", color: "var(--chart-2)", label: "Text only" },
];

const tooltipStyle = {
  background: "var(--surface-elevated)",
  border: "1px solid var(--hairline-strong)",
  borderRadius: "0.6rem",
  boxShadow: "0 12px 32px -12px rgba(0, 0, 0, 0.22)",
  color: "var(--foreground)",
  fontFamily: "var(--font-sans)",
  fontSize: "12px",
  padding: "6px 8px",
};

export const ContentMixCard = React.memo(function ContentMixCard({
  breakdown,
  variant = "card",
}: {
  breakdown: AnalyticsData["mediaBreakdown"];
  variant?: ChartVariant;
}) {
  const safeBreakdown = useMemo(() => breakdown ?? [], [breakdown]);
  const total = useMemo(() => safeBreakdown.reduce((s, m) => s + m.count, 0), [safeBreakdown]);
  const byKey = useMemo(() => new Map(safeBreakdown.map((b) => [b.type, b.count])), [safeBreakdown]);
  const segments = useMemo(
    () =>
      MIX_SERIES.map((s) => ({
        ...s,
        count: byKey.get(s.key) ?? 0,
        pct: total > 0 ? ((byKey.get(s.key) ?? 0) / total) * 100 : 0,
      })).filter((s) => s.count > 0),
    [byKey, total]
  );

  const chartData = useMemo(
    () => [
      segments.reduce<Record<string, number | string>>(
        (acc, s) => {
          acc[s.key] = s.pct;
          return acc;
        },
        { name: "mix" }
      ),
    ],
    [segments]
  );

  const contentMixLabel = useMemo(() => {
    if (segments.length === 0) return "Content mix chart";
    const summary = segments.map((s) => `${s.pct.toFixed(0)}% ${s.label}`).join(", ");
    return `Bar chart showing content mix: ${summary}`;
  }, [segments]);

  const chartSurfaceClass =
    variant === "flat" ? analyticsChartSurfaceClass : analyticsChartSurfaceCardClass;

  return (
    <ChartShell variant={variant}>
      <SectionHeading
        title="Content mix"
        icon={<Layers className="h-4 w-4" />}
        meta={total > 0 ? `${total.toLocaleString()} bookmarks` : undefined}
        variant={variant}
      />
      {total === 0 ? (
        <EmptyBox />
      ) : (
        <div className="flex flex-col gap-4">
          <div className={chartSurfaceClass} role="img" aria-label={contentMixLabel}>
            <ResponsiveContainer width="100%" height={44}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
              >
                <XAxis type="number" hide domain={[0, 100]} />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "transparent" }}
                  formatter={(v, n) => [`${Number(v ?? 0).toFixed(0)}%`, String(n)]}
                />
                {segments.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    stackId="mix"
                    fill={s.color}
                    radius={
                      i === 0 && segments.length === 1
                        ? 6
                        : i === 0
                          ? [6, 0, 0, 6]
                          : i === segments.length - 1
                            ? [0, 6, 6, 0]
                            : 0
                    }
                    isAnimationActive={true}
                    animationDuration={600}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {segments.map((s) => (
              <li key={s.key} className="flex items-center gap-2 py-1">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1 truncate text-foreground">{s.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {s.pct.toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartShell>
  );
});
