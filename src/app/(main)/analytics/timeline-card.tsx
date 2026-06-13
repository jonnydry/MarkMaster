"use client";

import React, { useId, useMemo } from "react";
import { Activity } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AnalyticsData } from "@/types";
import { cn } from "@/lib/utils";

import {
  analyticsChartSurfaceClass,
  analyticsInsetStrongSurfaceClass,
} from "./analytics-primitives";
import type { TimeRange } from "./time-range";
import {
  ChartShell,
  EmptyBox,
  SectionHeading,
  type ChartVariant,
} from "./analytics-chart-shell";

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

const chartTickStyle = { fontSize: 11, fontFamily: "var(--font-sans)" };

type TimelinePoint = { label: string; count: number; iso: string };

export const TimelineCard = React.memo(function TimelineCard({
  analytics,
  range,
  variant = "card",
}: {
  analytics: AnalyticsData;
  range: TimeRange;
  variant?: ChartVariant;
}) {
  const timelineFillId = `timeline-fill-${useId().replace(/:/g, "")}`;
  const timeline = useMemo(() => buildTimeline(analytics, range), [analytics, range]);
  const peak = useMemo(() => findPeak(timeline.data), [timeline.data]);
  const rangeTotal = useMemo(
    () => timeline.data.reduce((s, d) => s + d.count, 0),
    [timeline.data]
  );

  const timelineLabel = useMemo(() => {
    if (timeline.data.length === 0) return "Bookmarks over time chart";
    return `Area chart showing ${rangeTotal.toLocaleString()} bookmarks over ${rangeLabel(range)}`;
  }, [timeline.data.length, rangeTotal, range]);

  const chartSurfaceClass =
    variant === "flat"
      ? cn(analyticsChartSurfaceClass, "px-3 py-4")
      : cn(analyticsInsetStrongSurfaceClass, "px-3 py-4");

  return (
    <ChartShell variant={variant}>
      <SectionHeading
        title="Bookmarks over time"
        icon={<Activity className="h-4 w-4" />}
        meta={
          rangeTotal > 0 ? `${rangeTotal.toLocaleString()} in ${rangeLabel(range)}` : undefined
        }
        variant={variant}
      />
      {timeline.data.length === 0 ? (
        <EmptyBox height={220} />
      ) : (
        <div className={chartSurfaceClass} role="img" aria-label={timelineLabel}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={timeline.data}
              margin={{ top: 8, right: 12, bottom: 0, left: -8 }}
            >
              <defs>
                <linearGradient id={timelineFillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--hairline-soft)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                stroke="var(--muted-foreground)"
                tick={chartTickStyle}
                tickLine={false}
                axisLine={false}
                minTickGap={timeline.tickGap}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                tick={chartTickStyle}
                tickLine={false}
                axisLine={false}
                width={32}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ stroke: "var(--hairline-strong)", strokeWidth: 1 }}
                labelFormatter={(l) => String(l)}
                formatter={(v) => [Number(v ?? 0).toLocaleString(), "Bookmarks"]}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--primary)"
                strokeWidth={2.25}
                fill={`url(#${timelineFillId})`}
                dot={false}
                activeDot={{
                  r: 4,
                  strokeWidth: 2,
                  stroke: "var(--surface-1)",
                  fill: "var(--primary)",
                }}
                animationDuration={600}
              />
              {peak ? (
                <ReferenceDot
                  x={peak.label}
                  y={peak.count}
                  r={5}
                  fill="var(--note)"
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                  ifOverflow="visible"
                />
              ) : null}
            </AreaChart>
          </ResponsiveContainer>
          {peak ? (
            <p className="mt-2 px-1 text-xs text-muted-foreground">
              <span
                className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                style={{ backgroundColor: "var(--note)" }}
              />
              Peak {peak.label} · {peak.count.toLocaleString()} bookmarks
            </p>
          ) : null}
        </div>
      )}
    </ChartShell>
  );
});

function buildTimeline(
  analytics: AnalyticsData,
  range: TimeRange
): { data: TimelinePoint[]; tickGap: number } {
  if (range === "30d" || range === "90d") {
    const days = range === "30d" ? 30 : 90;
    const today = startOfUtcDay(new Date());
    const map = new Map(analytics.bookmarksByDay.map((d) => [d.day, d.count]));
    const data: TimelinePoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      data.push({
        iso,
        label: formatDayLabel(d),
        count: map.get(iso) ?? 0,
      });
    }
    return { data, tickGap: days === 30 ? 24 : 40 };
  }

  const months = range === "12m" ? 12 : null;
  const source = analytics.bookmarksByMonth;
  if (source.length === 0) return { data: [], tickGap: 24 };

  let sliced = source;
  if (months) sliced = source.slice(-months);

  return {
    data: sliced.map((m) => ({
      iso: m.month,
      label: formatMonthLabel(m.month),
      count: m.count,
    })),
    tickGap: 16,
  };
}

function findPeak(data: TimelinePoint[]) {
  if (data.length === 0) return null;
  let peak = data[0];
  for (const d of data) if (d.count > peak.count) peak = d;
  return peak.count > 0 ? peak : null;
}

function startOfUtcDay(d: Date) {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function formatDayLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatMonthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
  });
}

function rangeLabel(range: TimeRange) {
  switch (range) {
    case "30d":
      return "last 30 days";
    case "90d":
      return "last 90 days";
    case "12m":
      return "last 12 months";
    case "all":
      return "all time";
    default: {
      const _exhaustive: never = range;
      return _exhaustive;
    }
  }
}
