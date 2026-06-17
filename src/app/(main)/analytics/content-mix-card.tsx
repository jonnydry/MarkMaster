"use client";

import React, { useMemo } from "react";
import { Layers } from "lucide-react";

import type { AnalyticsData } from "@/types";
import { SimpleBarChart } from "@/components/charts/simple-bar-chart";

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
            <SimpleBarChart segments={segments} height={44} />
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
