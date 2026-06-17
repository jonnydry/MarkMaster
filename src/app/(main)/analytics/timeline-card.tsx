"use client";

import React, { useMemo } from "react";
import { Activity } from "lucide-react";

import type { AnalyticsData } from "@/types";
import { cn } from "@/lib/utils";
import { SimpleAreaChart } from "@/components/charts/simple-area-chart";

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

export const TimelineCard = React.memo(function TimelineCard({
  analytics,
  range,
  variant = "card",
}: {
  analytics: AnalyticsData;
  range: TimeRange;
  variant?: ChartVariant;
}) {
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
          <SimpleAreaChart
            data={timeline.data}
            height={220}
            maxXLabels={range === "90d" ? 4 : 6}
            highlightLabel={peak?.label}
          />
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
): { data: { label: string; count: number }[]; tickGap: number } {
  if (range === "30d" || range === "90d") {
    const days = range === "30d" ? 30 : 90;
    const today = startOfUtcDay(new Date());
    const map = new Map(analytics.bookmarksByDay.map((d) => [d.day, d.count]));
    const data: { label: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      data.push({
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
      label: formatMonthLabel(m.month),
      count: m.count,
    })),
    tickGap: 16,
  };
}

function findPeak(data: { label: string; count: number }[]) {
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
