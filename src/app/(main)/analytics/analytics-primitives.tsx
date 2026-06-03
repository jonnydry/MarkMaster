"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnalyticsData } from "@/types";
import type { TimeRange } from "./time-range";

export const ANALYTICS_TABS = [
  { id: "overview", label: "Overview" },
  { id: "composition", label: "Composition" },
  { id: "activity", label: "Activity" },
  { id: "signals", label: "Signals" },
] as const;

export type AnalyticsTab = (typeof ANALYTICS_TABS)[number]["id"];

export const RANGE_OPTIONS: Array<{ value: TimeRange; label: string }> = [
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "12m", label: "12m" },
  { value: "all", label: "All" },
];

export function parseAnalyticsTab(value: string | null): AnalyticsTab {
  if (
    value === "composition" ||
    value === "activity" ||
    value === "signals"
  ) {
    return value;
  }
  return "overview";
}

export function AnalyticsRangeSegment({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Time range"
      className="inline-flex rounded-sm border border-hairline-soft bg-background/35 p-0.5"
    >
      {RANGE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-8 rounded-sm px-2.5 text-xs font-semibold tabular-nums transition-colors",
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent-soft hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function AnalyticsTabs({
  activeTab,
  onTabChange,
  className,
}: {
  activeTab: AnalyticsTab;
  onTabChange: (tab: AnalyticsTab) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Analytics sections"
      className={cn(
        "flex gap-1 overflow-x-auto border-b border-hairline-soft pb-px scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {ANALYTICS_TABS.map(({ id, label }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(id)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function AnalyticsHero({
  totalBookmarks,
  orbitQueueCount,
  untaggedCount,
  triagedPct,
  last30d,
  velocityDelta,
  notedCount,
  annotationPct,
  oldestAt,
  orbitHref,
  lastSyncAt,
}: {
  totalBookmarks: number;
  orbitQueueCount: number;
  untaggedCount: number;
  triagedPct: number;
  last30d: number;
  velocityDelta: { pct: number | null; abs: number } | null;
  notedCount: number;
  annotationPct: number;
  oldestAt: string | null;
  orbitHref: string;
  lastSyncAt?: Date | string | null;
}) {
  const untaggedPct = 100 - triagedPct;
  const allTriaged = untaggedCount === 0;
  const trend =
    !velocityDelta
      ? "flat"
      : velocityDelta.pct == null
        ? "up"
        : velocityDelta.pct > 0
          ? "up"
          : velocityDelta.pct < 0
            ? "down"
            : "flat";
  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const deltaTone =
    trend === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : trend === "down"
        ? "text-destructive"
        : "text-muted-foreground";
  const deltaLabel =
    !velocityDelta
      ? "—"
      : velocityDelta.pct == null
        ? "first 30 days"
        : `${velocityDelta.pct > 0 ? "+" : ""}${velocityDelta.pct.toFixed(0)}% vs prior 30d`;
  const syncLabel = lastSyncAt
    ? `Synced ${formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true })}`
    : "Not synced yet";
  const oldestLabel = oldestAt ? relativeOldest(new Date(oldestAt)) : null;

  return (
    <section className="border-b border-hairline-soft pb-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <HeroStat label="Bookmarks" value={totalBookmarks.toLocaleString()} />
          <HeroStat
            label="In Orbit"
            value={orbitQueueCount.toLocaleString()}
            hint={allTriaged ? "All tagged" : `${untaggedCount.toLocaleString()} untagged`}
          />
          <HeroStat
            label="Last 30 days"
            value={last30d.toLocaleString()}
            hint={
              <span className={cn("inline-flex items-center gap-1", deltaTone)}>
                <TrendIcon className="size-3" aria-hidden />
                {deltaLabel}
              </span>
            }
          />
          <HeroStat
            label="Annotated"
            value={`${annotationPct.toFixed(0)}%`}
            hint={`${notedCount.toLocaleString()} with notes`}
          />
        </dl>
        {!allTriaged && orbitQueueCount > 0 ? (
          <Link href={orbitHref} className={cn(buttonVariants({ size: "sm" }), "shrink-0 gap-1")}>
            Triage now
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
          <span>Tagged {triagedPct.toFixed(0)}%</span>
          <span>Untagged {untaggedPct.toFixed(0)}%</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${triagedPct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {syncLabel}
          {oldestLabel && !allTriaged ? (
            <>
              <span className="text-muted-foreground/50"> · </span>
              Oldest waiting since {oldestLabel}
            </>
          ) : null}
          {orbitQueueCount > 0 ? (
            <>
              <span className="text-muted-foreground/50"> · </span>
              <Link href={orbitHref} className="font-medium text-foreground hover:text-primary">
                Review Orbit
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}

function HeroStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums heading-font">{value}</dd>
      {hint ? <dd className="mt-0.5 text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

export function AnalyticsSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("py-6 first:pt-4", className)}>
      <header className="mb-4">
        <h2 className="text-sm font-semibold heading-font">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export const analyticsChartSurfaceClass =
  "rounded-sm border border-hairline-soft bg-surface-2/40 p-3";

const SOURCE_LABELS: Record<string, string> = {
  highlights: "Highlights",
  library_highlights: "Library",
  library_control: "Control",
  digest: "Digest",
  "weekly-gems": "Gems",
  direct: "Direct",
};

export function FlywheelSignalsPanel({ analytics }: { analytics: AnalyticsData }) {
  const cta = analytics.flywheelCtaReviewInOrbit ?? 0;
  const digestCta = analytics.flywheelDigestReviewTogether ?? 0;
  const good = analytics.flywheelFeedbackGood ?? 0;
  const notRel = analytics.flywheelFeedbackNotRelevant ?? 0;
  const quick = analytics.flywheelQuickModeToggles ?? 0;
  const deep = analytics.flywheelDeepModeToggles ?? 0;
  const sessions = analytics.flywheelDigestSessions ?? 0;
  const digestRate = analytics.flywheelDigestCtaToSessionRate ?? 0;
  const quickShare = analytics.flywheelQuickPassShare ?? 0;
  const topEntrySources = analytics.flywheelTopEntrySources ?? [];
  const quickKeeps = analytics.flywheelQuickKeepCount ?? 0;
  const quickKeepRate = analytics.flywheelQuickPassKeepRate ?? 0;
  const orbitAccepted = analytics.orbitDecisionAccepted ?? 0;
  const orbitEdited = analytics.orbitDecisionEdited ?? 0;
  const orbitKept = analytics.orbitDecisionKept ?? 0;
  const orbitRejected = analytics.orbitDecisionRejected ?? 0;
  const orbitTotal =
    analytics.orbitDecisionTotal ??
    orbitAccepted + orbitEdited + orbitKept + orbitRejected;
  const orbitAcceptRate = analytics.orbitDecisionAcceptRate ?? 0;
  const orbitEditRate = analytics.orbitDecisionEditRate ?? 0;
  const orbitHighConfidenceAcceptRate = analytics.orbitHighConfidenceAcceptRate ?? 0;
  const sourceLabel = (src: string) => SOURCE_LABELS[src] || src;

  const totalSignals =
    cta + digestCta + good + notRel + quick + deep + sessions + quickKeeps + orbitTotal;
  if (totalSignals === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No flywheel activity in this range yet.
      </p>
    );
  }

  return (
    <div className="space-y-4 py-6 first:pt-4">
      <p className="text-xs text-muted-foreground">
        Product telemetry for Orbit rituals and digest flows in the selected time range.
      </p>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <SignalRow label="Highlights → Orbit" value={cta} />
        <SignalRow label="Digest review together" value={digestCta} />
        <SignalRow label="Good feedback" value={good} />
        <SignalRow label="Not relevant feedback" value={notRel} />
        <SignalRow label="Quick Pass toggles" value={quick} />
        <SignalRow label="Deep Review toggles" value={deep} />
        <SignalRow label="Digest sessions" value={sessions} />
        <SignalRow label="Orbit accepted" value={orbitAccepted} />
        <SignalRow label="Orbit edited" value={orbitEdited} />
        <SignalRow label="Orbit kept" value={orbitKept} />
        <SignalRow label="Orbit rejected" value={orbitRejected} />
      </dl>
      {(digestCta > 0 ||
        quick + deep > 0 ||
        topEntrySources.length > 0 ||
        quickKeeps > 0 ||
        orbitTotal > 0) && (
        <div className="border-t border-hairline-soft pt-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {digestCta > 0 ? (
              <span>
                Digest CTA → session{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {Math.round(digestRate * 100)}%
                </span>
              </span>
            ) : null}
            {quick + deep > 0 ? (
              <span>
                Quick Pass share{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {Math.round(quickShare * 100)}%
                </span>
              </span>
            ) : null}
            {topEntrySources.length > 0 ? (
              <span>
                Top sources{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {topEntrySources
                    .map((s) => `${sourceLabel(s.source)} ${Math.round(s.pct * 100)}%`)
                    .join(" · ")}
                </span>
              </span>
            ) : null}
            {quickKeeps > 0 ? (
              <span>
                Quick Pass keep rate{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {Math.round(quickKeepRate * 100)}%
                </span>
              </span>
            ) : null}
            {orbitTotal > 0 ? (
              <span>
                Orbit accept rate{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {Math.round(orbitAcceptRate * 100)}%
                </span>
              </span>
            ) : null}
            {orbitTotal > 0 ? (
              <span>
                Orbit edit rate{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {Math.round(orbitEditRate * 100)}%
                </span>
              </span>
            ) : null}
            {orbitTotal > 0 ? (
              <span>
                High-confidence accept{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {Math.round(orbitHighConfidenceAcceptRate * 100)}%
                </span>
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function SignalRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}

function relativeOldest(date: Date) {
  const now = new Date();
  const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w} week${w === 1 ? "" : "s"} ago`;
  }
  if (days < 365) {
    const m = Math.floor(days / 30);
    return `${m} month${m === 1 ? "" : "s"} ago`;
  }
  const y = Math.floor(days / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}
