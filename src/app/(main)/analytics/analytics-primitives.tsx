"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { HighlightProgress } from "@/components/highlight-progress";
import { buttonVariants } from "@/components/ui/button";
import { StatRow } from "@/components/ui/stat-row";
import { ToolbarSegmentControl } from "@/components/toolbar/toolbar-primitives";
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
  disabled = false,
}: {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
  disabled?: boolean;
}) {
  return (
    <ToolbarSegmentControl
      value={value}
      onChange={onChange}
      aria-label="Time range"
      variant="library"
      size="md"
      options={RANGE_OPTIONS.map((option) => ({
        value: option.value,
        label: <span className="tabular-nums">{option.label}</span>,
        disabled,
      }))}
    />
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
            id={`analytics-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(id)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45",
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
  rawHighlightsCount,
  totalTags,
  totalCollections,
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
  rawHighlightsCount: number;
  totalTags: number;
  totalCollections: number;
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
      ? "text-success"
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
  const primaryOrganizeHref =
    rawHighlightsCount > 0
      ? "/dashboard?discovery=1#dashboard-discovery-panel"
      : orbitHref;

  return (
    <section className="border-b border-hairline-soft pb-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <StatRow label="Bookmarks" value={totalBookmarks.toLocaleString()} />
          <StatRow
            label="In Orbit"
            value={orbitQueueCount.toLocaleString()}
            hint={allTriaged ? "All tagged" : `${untaggedCount.toLocaleString()} untagged`}
          />
          <StatRow
            label="Last 30 days"
            value={last30d.toLocaleString()}
            hint={
              <span className={cn("inline-flex items-center gap-1", deltaTone)}>
                <TrendIcon className="size-3" aria-hidden />
                {deltaLabel}
              </span>
            }
          />
          <StatRow
            label="Annotated"
            value={`${annotationPct.toFixed(0)}%`}
            hint={`${notedCount.toLocaleString()} with notes`}
          />
        </dl>
        {!allTriaged && orbitQueueCount > 0 ? (
          <Link
            href={primaryOrganizeHref}
            className={cn(
              buttonVariants({ variant: "highlight", size: "sm" }),
              "shrink-0 gap-1"
            )}
          >
            {rawHighlightsCount > 0 ? "Start Organization Sprint" : "Organize in Orbit"}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
          <span>Tagged {triagedPct.toFixed(0)}%</span>
          <span>Untagged {untaggedPct.toFixed(0)}%</span>
        </div>
        <HighlightProgress
          className="mt-1.5 w-full"
          percent={triagedPct}
          size="md"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {syncLabel}
          <span className="text-muted-foreground/50"> · </span>
          {totalTags.toLocaleString()} {totalTags === 1 ? "tag" : "tags"}
          <span className="text-muted-foreground/50"> · </span>
          {totalCollections.toLocaleString()}{" "}
          {totalCollections === 1 ? "collection" : "collections"}
          {rawHighlightsCount > 0 ? (
            <>
              <span className="text-muted-foreground/50"> · </span>
              {rawHighlightsCount.toLocaleString()} ready for Discovery
            </>
          ) : null}
          {oldestLabel && !allTriaged ? (
            <>
              <span className="text-muted-foreground/50"> · </span>
              Oldest waiting since {oldestLabel}
            </>
          ) : null}
          {orbitQueueCount > 0 ? (
            <>
              <span className="text-muted-foreground/50"> · </span>
              <Link href={orbitHref} className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline">
                Organize in Orbit
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}

/** Inset well for chart/list regions on the flat analytics layout. */
export const analyticsInsetSurfaceClass = "surface-inset";

/** Stronger inset for nested regions inside analytics cards. */
export const analyticsInsetStrongSurfaceClass = "surface-inset-strong";

export const analyticsChartSurfaceClass = cn(analyticsInsetSurfaceClass, "p-3");

export const analyticsChartSurfaceCardClass = cn(analyticsInsetStrongSurfaceClass, "p-3");

export const analyticsListSurfaceClass =
  "flex flex-col divide-y divide-hairline-soft overflow-hidden surface-inset";

export const analyticsListSurfaceCardClass =
  "flex flex-col divide-y divide-hairline-soft overflow-hidden surface-inset-strong";

const SOURCE_LABELS: Record<string, string> = {
  highlights: "Highlights",
  library_highlights: "Library",
  library_control: "Library health",
  digest: "Discovery",
  "weekly-gems": "Discovery",
  "organization-sprint": "Organization Sprint",
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
      <div
        role="status"
        className="surface-inset flex items-center justify-center border-dashed py-16 text-sm text-muted-foreground"
      >
        No Orbit review activity in this range yet.
      </div>
    );
  }

  return (
    <div className="space-y-4 py-6 first:pt-4">
      <p className="text-xs text-muted-foreground">
        How often Orbit suggestions helped and where focused review sessions began.
      </p>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatRow size="base" label="Bookmarks opened in Orbit" value={cta.toLocaleString()} />
        <StatRow size="base" label="Organization Sprint starts" value={digestCta.toLocaleString()} />
        <StatRow size="base" label="Sprint sessions" value={sessions.toLocaleString()} />
        <StatRow size="base" label="Suggestions reviewed" value={orbitTotal.toLocaleString()} />
        <StatRow size="base" label="Accepted as suggested" value={orbitAccepted.toLocaleString()} />
        <StatRow size="base" label="Edited before applying" value={orbitEdited.toLocaleString()} />
        <StatRow size="base" label="Kept for later" value={orbitKept.toLocaleString()} />
        <StatRow size="base" label="Rejected" value={orbitRejected.toLocaleString()} />
        <StatRow size="base" label="Helpful resurfacing" value={good.toLocaleString()} />
        <StatRow size="base" label="Not useful" value={notRel.toLocaleString()} />
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
                Sprint launch rate{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {Math.round(digestRate * 100)}%
                </span>
              </span>
            ) : null}
            {quick + deep > 0 ? (
              <span>
                Quick review usage{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {Math.round(quickShare * 100)}%
                </span>
              </span>
            ) : null}
            {topEntrySources.length > 0 ? (
              <span>
                Top entry points{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {topEntrySources
                    .map((s) => `${sourceLabel(s.source)} ${Math.round(s.pct * 100)}%`)
                    .join(" · ")}
                </span>
              </span>
            ) : null}
            {quickKeeps > 0 ? (
              <span>
                Quick review keep rate{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {Math.round(quickKeepRate * 100)}%
                </span>
              </span>
            ) : null}
            {orbitTotal > 0 ? (
              <span>
                Accepted unchanged{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {Math.round(orbitAcceptRate * 100)}%
                </span>
              </span>
            ) : null}
            {orbitTotal > 0 ? (
              <span>
                Edited before applying{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {Math.round(orbitEditRate * 100)}%
                </span>
              </span>
            ) : null}
            {orbitTotal > 0 ? (
              <span>
                High-confidence accepted{" "}
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
