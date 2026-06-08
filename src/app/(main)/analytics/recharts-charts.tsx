"use client";

import React, { useId, useMemo } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceDot,
} from "recharts";
import { BadgeCheck, ArrowUpRight, Activity, Users, Layers, Hash, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { AnalyticsData } from "@/types";
import type { TimeRange } from "./time-range";
import { analyticsChartSurfaceClass } from "./analytics-primitives";
import { cn } from "@/lib/utils";

type ChartVariant = "card" | "flat";

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

const chartTickStyle = { fontSize: 11, fontFamily: "var(--font-sans)" };

const chartCardClass = "border-hairline-soft bg-surface-1 p-5 shadow-sm";

function ChartShell({
  variant,
  className,
  children,
}: {
  variant: ChartVariant;
  className?: string;
  children: React.ReactNode;
}) {
  if (variant === "flat") {
    return <section className={cn("py-6 first:pt-4", className)}>{children}</section>;
  }
  const RootCard = Card;
  const rootClass = cn(chartCardClass, "animate-fade-in-up", className);
  return <RootCard className={rootClass}>{children}</RootCard>;
}

function SectionHeading({
  title,
  icon,
  meta,
  aside,
  variant = "card",
}: {
  title: string;
  icon: React.ReactNode;
  meta?: string;
  aside?: React.ReactNode;
  variant?: ChartVariant;
}) {
  if (variant === "flat") {
    return (
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold heading-font">{title}</h2>
          {meta ? <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </header>
    );
  }
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            "bg-primary/8 text-primary"
          )}
        >
          {icon}
        </span>
        <h2
          className={cn(
            "min-w-0 text-base font-semibold",
            "heading-font"
          )}
        >
          {title}
        </h2>
      </div>
      {(meta || aside) && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 sm:shrink-0 sm:justify-end">
          {meta ? (
            <span
              className={cn(
                "text-xs tabular-nums",
                "text-muted-foreground"
              )}
            >
              {meta}
            </span>
          ) : null}
          {aside}
        </div>
      )}
    </div>
  );
}

export const TopVoicesCard = React.memo(function TopVoicesCard({
  authors,
  totalBookmarks,
  variant = "card",
}: {
  authors: AnalyticsData["topAuthors"];
  totalBookmarks: number;
  variant?: ChartVariant;
}) {
  const max = useMemo(() => authors.reduce((m, a) => Math.max(m, a.count), 0) || 1, [authors]);
  const topShare = useMemo(
    () =>
      totalBookmarks > 0
        ? (authors.slice(0, 3).reduce((s, a) => s + a.count, 0) / totalBookmarks) * 100
        : 0,
    [authors, totalBookmarks]
  );
  const topShareSingle = useMemo(
    () =>
      totalBookmarks > 0 && authors.length > 0
        ? (authors[0].count / totalBookmarks) * 100
        : 0,
    [authors, totalBookmarks]
  );
  const overexposed = useMemo(() => topShareSingle >= 15, [topShareSingle]);

  const listClass =
    variant === "flat"
      ? "flex flex-col divide-y divide-hairline-soft overflow-hidden rounded-sm border border-hairline-soft bg-surface-2/40"
      : cn(
          "flex flex-col overflow-hidden rounded-xl border",
          "divide-y divide-hairline-soft border-hairline-soft bg-surface-2"
        );

  return (
    <ChartShell variant={variant}>
      <SectionHeading
        title="Top voices"
        icon={<Users className="h-4 w-4" />}
        meta={authors.length > 0 ? `${authors.length} authors` : undefined}
        variant={variant}
      />
      {authors.length === 0 ? (
        <EmptyBox />
      ) : (
        <div className="flex flex-col gap-3">
          {overexposed ? (
            <div
              className={cn(
                "flex items-start gap-2 rounded-xl px-3 py-2 text-xs",
                "border border-note/30 bg-note/8 text-foreground"
              )}
            >
              <AlertTriangle
                className={cn(
                  "mt-0.5 h-3.5 w-3.5 shrink-0",
                  "text-note"
                )}
              />
              <span>
                <span className="font-medium">@{authors[0].author}</span> is{" "}
                <span className="font-medium tabular-nums">
                  {topShareSingle.toFixed(0)}%
                </span>{" "}
                of your library. Consider diversifying your saves.
              </span>
            </div>
          ) : null}

          <ul className={listClass}>
            {authors.map((a, idx) => {
              const share = (a.count / max) * 100;
              const libraryShare =
                totalBookmarks > 0 ? (a.count / totalBookmarks) * 100 : 0;
              return (
                <li key={a.author}>
                  <Link
                    href={`/dashboard?author=${encodeURIComponent(a.author)}`}
                    className={cn(
                      "group grid grid-cols-[auto_minmax(0,1.6fr)_minmax(0,2fr)_auto_auto] items-center gap-3 px-3 py-2.5 transition-colors",
                      "hover:bg-surface-1"
                    )}
                  >
                    <span
                      className={cn(
                        "flex w-5 shrink-0 items-center justify-center text-[11px] font-semibold tabular-nums",
                        "text-muted-foreground"
                      )}
                    >
                      {idx + 1}
                    </span>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar size="sm">
                        {a.profileImage ? (
                          <AvatarImage src={a.profileImage} alt={a.displayName ?? a.author} />
                        ) : null}
                        <AvatarFallback>
                          {(a.displayName ?? a.author).slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 leading-tight">
                        <div className="flex items-center gap-1">
                          <span className="truncate text-sm font-medium">
                            {a.displayName ?? a.author}
                          </span>
                          {a.verified ? (
                            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Verified" />
                          ) : null}
                        </div>
                        <span
                          className={cn(
                            "block truncate text-[11px]",
                            "text-muted-foreground"
                          )}
                        >
                          @{a.author}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    <div className="flex flex-col items-end leading-tight">
                      <span
                        className={cn(
                          "text-sm font-medium tabular-nums",
                          ""
                        )}
                      >
                        {a.count.toLocaleString()}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] tabular-nums",
                          "text-muted-foreground"
                        )}
                      >
                        {libraryShare.toFixed(1)}%
                      </span>
                    </div>
                    <ArrowUpRight
                      className={cn(
                        "h-3.5 w-3.5 transition-colors",
                        "text-muted-foreground/0 group-hover:text-muted-foreground"
                      )}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>

          {totalBookmarks > 0 && authors.length >= 3 && !overexposed ? (
            <p className={cn("px-1 text-xs", "text-muted-foreground")}>
              Your top 3 voices account for{" "}
              <span className={cn("font-medium tabular-nums", "text-foreground")}>
                {topShare.toFixed(0)}%
              </span>{" "}
              of your library.
            </p>
          ) : null}
        </div>
      )}
    </ChartShell>
  );
});

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
    variant === "flat"
      ? analyticsChartSurfaceClass
      : cn(
          "rounded-xl border p-3",
          "border-hairline-soft bg-surface-2"
        );

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
                <span
                  className={cn(
                    "flex-1 truncate",
                    "text-foreground"
                  )}
                >
                  {s.label}
                </span>
                <span
                  className={cn(
                    "tabular-nums text-xs",
                    "text-muted-foreground"
                  )}
                >
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

export const TagRankCard = React.memo(function TagRankCard({
  tags,
  variant = "card",
}: {
  tags: AnalyticsData["tagDistribution"];
  variant?: ChartVariant;
}) {
  const max = useMemo(() => tags.reduce((m, t) => Math.max(m, t.count), 0) || 1, [tags]);
  const listClass =
    variant === "flat"
      ? "flex flex-col divide-y divide-hairline-soft overflow-hidden rounded-sm border border-hairline-soft bg-surface-2/40"
      : cn(
          "flex flex-col overflow-hidden rounded-xl border",
          "divide-y divide-hairline-soft border-hairline-soft bg-surface-2"
        );

  return (
    <ChartShell variant={variant}>
      <SectionHeading
        title="Most used tags"
        icon={<Hash className="h-4 w-4" />}
        meta={tags.length > 0 ? `${tags.length} tags` : undefined}
        variant={variant}
      />
      {tags.length === 0 ? (
        <EmptyBox />
      ) : (
        <ul className={listClass}>
          {tags.slice(0, 10).map((t) => {
            const share = (t.count / max) * 100;
            return (
              <li key={t.id}>
                <Link
                  href={`/dashboard?tag=${encodeURIComponent(t.id)}`}
                  className={cn(
                    "group grid grid-cols-[auto_minmax(0,1fr)_minmax(96px,38%)_auto_auto] items-center gap-3 px-3 py-2.5 transition-colors",
                    "hover:bg-surface-1"
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: t.color }}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "truncate text-sm font-medium",
                      ""
                    )}
                  >
                    {t.tag}
                  </span>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      "text-muted-foreground"
                    )}
                  >
                    {t.count.toLocaleString()}
                  </span>
                  <ArrowUpRight
                    className={cn(
                      "h-3.5 w-3.5 transition-colors",
                      "text-muted-foreground/0 group-hover:text-muted-foreground"
                    )}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </ChartShell>
  );
});

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
      : cn(
          "rounded-xl border px-3 py-4",
          "border-hairline-soft bg-surface-2"
        );

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
            <p
              className={cn(
                "mt-2 px-1 text-[11px]",
                "text-muted-foreground"
              )}
            >
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

function EmptyBox({ height = 180 }: { height?: number }) {
  return (
    <div
      role="status"
      style={{ height }}
      className={cn(
        "flex items-center justify-center rounded-xl border border-dashed text-sm",
        "border-hairline-soft bg-surface-2 text-muted-foreground"
      )}
    >
      Nothing here yet
    </div>
  );
}

type TimelinePoint = { label: string; count: number; iso: string };

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
