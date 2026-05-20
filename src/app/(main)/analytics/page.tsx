"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  Inbox,
  StickyNote,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
import { Sidebar } from "@/components/sidebar-dynamic";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { LibraryControlCenter } from "@/components/library-control-center";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { fetchJson } from "@/lib/fetch-json";
import { buildOrbitIntentHref } from "@/lib/orbit-navigation";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";
import type { AnalyticsData } from "@/types";
import type { TimeRange } from "./time-range";

import { useOrbitalTheme } from "@/components/providers";
import { orbital, OrbitalCard, TelemetryStat } from "@/components/orbital";

export type { TimeRange };

const CreateCollectionDialog = dynamic(
  () =>
    import("@/components/create-collection-dialog").then(
      (m) => m.CreateCollectionDialog
    ),
  { ssr: false }
);

const TopVoicesCard = dynamic(
  () => import("./recharts-charts").then((m) => m.TopVoicesCard),
  { ssr: false }
);
const ContentMixCard = dynamic(
  () => import("./recharts-charts").then((m) => m.ContentMixCard),
  { ssr: false }
);
const TagRankCard = dynamic(
  () => import("./recharts-charts").then((m) => m.TagRankCard),
  { ssr: false }
);
const TimelineCard = dynamic(
  () => import("./recharts-charts").then((m) => m.TimelineCard),
  { ssr: false }
);

const RANGE_OPTIONS: Array<{ value: TimeRange; label: string }> = [
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "12m", label: "12m" },
  { value: "all", label: "All" },
];

export default function AnalyticsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { createCollection } = useCreateCollection();
  const [createOpen, setCreateOpen] = useState(false);
  const [range, setRange] = useState<TimeRange>("90d");
  const { isOrbital } = useOrbitalTheme();

  const rangeControl = useMemo(
    () => <RangeControl value={range} onChange={setRange} />,
    [range]
  );

  const {
    data: analytics,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<AnalyticsData>({
    queryKey: ["analytics", range],
    queryFn: () => fetchJson(`/api/analytics?range=${range}`),
  });

  const { data: tags = [] } = useTagsQuery();
  const { data: collections = [] } = useCollectionsQuery();
  const oldestOrbitHref = analytics
    ? buildOrbitIntentHref({
        intent: "oldest",
        orbitQueueCount: analytics.orbitQueueCount,
        untaggedOldestAt: analytics.untaggedOldestAt,
      })
    : "/orbit";
  const backlogOrbitHref = analytics
    ? buildOrbitIntentHref({
        intent: "backlog",
        orbitQueueCount: analytics.orbitQueueCount,
      })
    : "/orbit";

  const goToTagOnDashboard = (tagId: string) => {
    router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
  };

  const triagedPct = useMemo(() => {
    if (!analytics || analytics.totalBookmarks === 0) return 0;
    const triaged = analytics.totalBookmarks - analytics.untaggedCount;
    return Math.max(0, Math.min(100, (triaged / analytics.totalBookmarks) * 100));
  }, [analytics]);

  const velocityDelta = useMemo(() => {
    if (!analytics) return null;
    const { last30dCount, previous30dCount } = analytics;
    if (previous30dCount === 0 && last30dCount === 0) return { pct: 0, abs: 0 };
    if (previous30dCount === 0) return { pct: null, abs: last30dCount };
    const pct = ((last30dCount - previous30dCount) / previous30dCount) * 100;
    return { pct, abs: last30dCount - previous30dCount };
  }, [analytics]);

  const annotationPct = useMemo(() => {
    if (!analytics || analytics.totalBookmarks === 0) return 0;
    return (analytics.notedCount / analytics.totalBookmarks) * 100;
  }, [analytics]);

  return (
    <div className="app-shell-bg app-viewport flex overflow-hidden">
      <div className="hidden md:block h-full min-h-0 shrink-0 overflow-hidden">
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={[]}
          onTagToggle={goToTagOnDashboard}
          onCreateCollection={() => setCreateOpen(true)}
          lastSyncAt={
            session?.dbUser?.lastSyncAt
              ? new Date(session.dbUser.lastSyncAt)
              : null
          }
          onSyncComplete={() => {
            void invalidateLibraryQueries(queryClient);
            void queryClient.invalidateQueries({ queryKey: ["analytics"] });
          }}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="app-main-scroll scrollbar-thin">
          <PageHeader
            sticky
            title="Analytics"
            description="How your library is growing — and what still needs attention"
            leading={
              <div className="md:hidden">
                <MobileSidebar
                  tags={tags}
                  collections={collections}
                  selectedTags={[]}
                  onTagToggle={goToTagOnDashboard}
                  onCreateCollection={() => setCreateOpen(true)}
                  onSyncComplete={() => {
                    void invalidateLibraryQueries(queryClient);
                    void queryClient.invalidateQueries({ queryKey: ["analytics"] });
                  }}
                />
              </div>
            }
            actions={
              session?.dbUser ? <UserNavDynamic user={session.dbUser} /> : undefined
            }
          />

          <div className="p-4 sm:p-5">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
              {isLoading ? (
                <LoadingSkeleton />
              ) : isError || !analytics ? (
                <ErrorState
                  message={error instanceof Error ? error.message : undefined}
                  onRetry={() => refetch()}
                />
              ) : analytics.totalBookmarks === 0 ? (
                <LibraryControlCenter
                  totalBookmarks={0}
                  untriagedCount={0}
                  totalTags={analytics.totalTags}
                  totalCollections={analytics.totalCollections}
                  notedCount={analytics.notedCount}
                  lastSyncAt={session?.dbUser?.lastSyncAt ?? null}
                  pendingHighlightsCount={0}
                  onSyncComplete={() => {
                    void invalidateLibraryQueries(queryClient);
                    void queryClient.invalidateQueries({ queryKey: ["analytics"] });
                  }}
                  // pendingHighlightsCount=0 for empty state (item 8 wiring to orbitQueueCount)
                />
              ) : (
                <>
                  <section className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                    <LibraryHealthCard
                      untaggedCount={analytics.untaggedCount}
                      orbitQueueCount={analytics.orbitQueueCount}
                      totalBookmarks={analytics.totalBookmarks}
                      triagedPct={triagedPct}
                      oldestAt={analytics.untaggedOldestAt}
                      orbitHref={oldestOrbitHref}
                    />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
                      <VelocityCard
                        last30d={analytics.last30dCount}
                        delta={velocityDelta}
                      />
                      <AnnotationCard
                        notedCount={analytics.notedCount}
                        totalBookmarks={analytics.totalBookmarks}
                        pct={annotationPct}
                      />
                    </div>
                  </section>

                  {/* Phase 3 Item 12 Slice 2: time-aware signals (via range filter) + two high-value ratios (restrained presentation).
                      Attribution captured at source. Still zero-weight when no signals. Elegant and calm by design. */}
                  <FlywheelSignalsCard analytics={analytics} />

                  <LibraryControlCenter
                    totalBookmarks={analytics.totalBookmarks}
                    untriagedCount={analytics.orbitQueueCount}
                    totalTags={analytics.totalTags}
                    totalCollections={analytics.totalCollections}
                    notedCount={analytics.notedCount}
                    lastSyncAt={session?.dbUser?.lastSyncAt ?? null}
                    orbitHref={backlogOrbitHref}
                    pendingHighlightsCount={analytics.orbitQueueCount}
                    onSyncComplete={() => {
                      void invalidateLibraryQueries(queryClient);
                      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
                    }}
                    // pendingHighlightsCount wired to orbitQueueCount (includes high-value raw Highlights pool for item 8)
                  />

                  <TopVoicesCard
                    authors={analytics.topAuthors}
                    totalBookmarks={analytics.totalBookmarks}
                  />

                  <div className="grid gap-5 xl:grid-cols-2">
                    <ContentMixCard breakdown={analytics.mediaBreakdown} />
                    <TagRankCard tags={analytics.tagDistribution} />
                  </div>

                  <TimelineCard
                    analytics={analytics}
                    range={range}
                    rangeControl={rangeControl}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreateCollection={createCollection}
      />
    </div>
  );
}

function LibraryHealthCard({
  untaggedCount,
  orbitQueueCount,
  totalBookmarks,
  triagedPct,
  oldestAt,
  orbitHref,
}: {
  untaggedCount: number;
  orbitQueueCount: number;
  totalBookmarks: number;
  triagedPct: number;
  oldestAt: string | null;
  orbitHref: string;
}) {
  const { isOrbital } = useOrbitalTheme();
  const untaggedPct = 100 - triagedPct;
  const oldestLabel = oldestAt
    ? relativeOldest(new Date(oldestAt))
    : null;
  const allTriaged = untaggedCount === 0;

  const RootCard = isOrbital ? OrbitalCard : Card;
  const rootCardClass = isOrbital
    ? "relative overflow-hidden p-5 animate-fade-in-up border-primary/10"
    : "relative overflow-hidden border-hairline-soft bg-surface-1 p-5 shadow-sm animate-fade-in-up";

  return (
    <RootCard className={rootCardClass}>
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                allTriaged ? "bg-emerald/10 text-emerald" : "bg-note/12 text-note"
              }`}
            >
              <Inbox className="h-4 w-4" />
            </span>
            <h2 className={cn(
              "text-sm font-semibold uppercase tracking-[0.14em]",
              isOrbital ? cn(orbital.label, "text-primary/80") : "text-muted-foreground"
            )}>
              Library Health
            </h2>
          </div>
          {isOrbital ? (
            <TelemetryStat
              value={allTriaged ? "All tagged" : untaggedCount.toLocaleString()}
              label={allTriaged
                ? `Every one of your ${totalBookmarks.toLocaleString()} bookmarks is organized.`
                : `untriaged · ${untaggedPct.toFixed(0)}% of ${totalBookmarks.toLocaleString()}`}
              className="mt-4"
            />
          ) : (
            <>
              <p className="mt-4 heading-font text-4xl font-bold tracking-tight tabular-nums">
                {allTriaged ? "All tagged" : untaggedCount.toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {allTriaged
                  ? `Every one of your ${totalBookmarks.toLocaleString()} bookmarks is organized.`
                  : `untriaged · ${untaggedPct.toFixed(0)}% of ${totalBookmarks.toLocaleString()}`}
              </p>
            </>
          )}
          {oldestLabel && !allTriaged ? (
            <p
              className={cn(
                "mt-1 text-xs",
                isOrbital ? cn(orbital.label, "text-primary/60") : "text-muted-foreground"
              )}
            >
              Oldest waiting since {oldestLabel}
            </p>
          ) : null}
        </div>

        {!allTriaged && orbitQueueCount > 0 ? (
          <Link
            href={orbitHref}
            className={`${buttonVariants({ size: "sm" })} shrink-0`}
          >
            Triage now
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      <div className="relative mt-5">
        <div
          className={cn(
            "flex justify-between text-[11px] font-medium tabular-nums",
            isOrbital ? cn(orbital.label, "text-primary/60") : "text-muted-foreground"
          )}
        >
          <span>Tagged {triagedPct.toFixed(0)}%</span>
          <span>Untagged {untaggedPct.toFixed(0)}%</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${triagedPct}%` }}
          />
        </div>
      </div>
    </RootCard>
  );
}

function VelocityCard({
  last30d,
  delta,
}: {
  last30d: number;
  delta: { pct: number | null; abs: number } | null;
}) {
  const { isOrbital } = useOrbitalTheme();
  const trend =
    !delta ? "flat" : delta.pct == null ? "up" : delta.pct > 0 ? "up" : delta.pct < 0 ? "down" : "flat";
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const deltaTone =
    trend === "up" ? "text-emerald" : trend === "down" ? "text-destructive" : "text-muted-foreground";
  const deltaLabel =
    !delta
      ? "—"
      : delta.pct == null
        ? "first 30 days"
        : `${delta.pct > 0 ? "+" : ""}${delta.pct.toFixed(0)}% vs prior 30d`;

  const RootCard = isOrbital ? OrbitalCard : Card;
  const rootClass = isOrbital
    ? "relative overflow-hidden border-primary/10 p-4 animate-fade-in-up stagger-1"
    : "relative overflow-hidden border-hairline-soft bg-surface-1 p-4 shadow-sm animate-fade-in-up stagger-1";

  return (
    <RootCard className={rootClass}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.14em]",
              isOrbital ? cn(orbital.label, "text-primary/80") : "text-muted-foreground"
            )}
          >
            Last 30 days
          </p>
          <p
            className={cn(
              "mt-2 text-2xl font-bold tabular-nums",
              isOrbital ? orbital.data : "heading-font"
            )}
          >
            {last30d.toLocaleString()}
          </p>
          <p className={`mt-1 flex items-center gap-1 text-xs ${deltaTone}`}>
            <Icon className="h-3 w-3" />
            {deltaLabel}
          </p>
        </div>
      </div>
    </RootCard>
  );
}

function AnnotationCard({
  notedCount,
  totalBookmarks,
  pct,
}: {
  notedCount: number;
  totalBookmarks: number;
  pct: number;
}) {
  const { isOrbital } = useOrbitalTheme();
  const RootCard = isOrbital ? OrbitalCard : Card;
  const rootClass = isOrbital
    ? "relative overflow-hidden border-primary/10 p-4 animate-fade-in-up stagger-2"
    : "relative overflow-hidden border-hairline-soft bg-surface-1 p-4 shadow-sm animate-fade-in-up stagger-2";

  return (
    <RootCard className={rootClass}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.14em]",
              isOrbital ? cn(orbital.label, "text-primary/80") : "text-muted-foreground"
            )}
          >
            Annotated
          </p>
          <p
            className={cn(
              "mt-2 text-2xl font-bold tabular-nums",
              isOrbital ? orbital.data : "heading-font"
            )}
          >
            {pct.toFixed(0)}%
          </p>
          <p
            className={cn(
              "mt-1 text-xs",
              isOrbital ? cn(orbital.label, "text-primary/60") : "text-muted-foreground"
            )}
          >
            {notedCount.toLocaleString()} of {totalBookmarks.toLocaleString()} with notes
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald/10 text-emerald">
          <StickyNote className="h-4 w-4" />
        </span>
      </div>
    </RootCard>
  );
}

/**
 * Phase 3 Item 12 Slice 3 — Per-Source Effectiveness + Quick Pass Outcome (builds on Slice 2)
 * All data time-filtered server-side via range. Per-source: lightweight top-3 entry sources (review CTAs + digest sessions)
 * grouped from payload->>'source' — shows which origins drive Orbit traffic (secondary, inline % only).
 * Quick Pass outcome: keep rate after quick (from minimal quick.keep instrumentation on decision sets; % of quick activity).
 * Everything remains ultra-restrained: appended to the *existing* ratios footer using identical tokens (no new card sections,
 * no charts, no visual weight, no extra labels). Zero-state and empty still perfectly calm. Elegance preserved at every layer.
 */
function FlywheelSignalsCard({ analytics }: { analytics: AnalyticsData }) {
  const { isOrbital } = useOrbitalTheme();
  const cta = analytics.flywheelCtaReviewInOrbit ?? 0;
  const digestCta = analytics.flywheelDigestReviewTogether ?? 0;
  const good = analytics.flywheelFeedbackGood ?? 0;
  const notRel = analytics.flywheelFeedbackNotRelevant ?? 0;
  const quick = analytics.flywheelQuickModeToggles ?? 0;
  const deep = analytics.flywheelDeepModeToggles ?? 0;
  const sessions = analytics.flywheelDigestSessions ?? 0;

  // Slice 2 ratios (0–1, pre-clamped and time-filtered on server)
  const digestRate = analytics.flywheelDigestCtaToSessionRate ?? 0;
  const quickShare = analytics.flywheelQuickPassShare ?? 0;

  // Slice 3 additions (server-computed, may be empty arrays/0 when no data yet)
  const topEntrySources = analytics.flywheelTopEntrySources ?? [];
  const quickKeeps = analytics.flywheelQuickKeepCount ?? 0;
  const quickKeepRate = analytics.flywheelQuickPassKeepRate ?? 0;

  // Ultra-light, view-only label map for per-source display (Slice 3).
  // Keeps raw keys for grouping/aggregation on server; only humanizes here for calm, premium readability.
  // No new state, no weight — just friendlier nouns in the existing inline footer.
  const SOURCE_LABELS: Record<string, string> = {
    highlights: "Highlights",
    library_highlights: "Library",
    library_control: "Control",
    digest: "Digest",
    "weekly-gems": "Gems",
    direct: "Direct",
  };
  const sourceLabel = (src: string): string => SOURCE_LABELS[src] || src;

  const totalSignals = cta + digestCta + good + notRel + quick + deep + sessions + quickKeeps;
  if (totalSignals === 0) return null;

  const RootCard = isOrbital ? OrbitalCard : Card;
  const rootClass = isOrbital
    ? "relative overflow-hidden border-primary/10 p-4 animate-fade-in-up"
    : "relative overflow-hidden border-hairline-soft bg-surface-1 p-4 shadow-sm animate-fade-in-up";

  return (
    <RootCard className={rootClass}>
      <div className="flex items-center gap-2">
        <h2
          className={cn(
            "text-sm font-semibold uppercase tracking-[0.14em]",
            isOrbital ? cn(orbital.label, "text-primary/80") : "text-muted-foreground"
          )}
        >
          Flywheel Signals
        </h2>
        <span
          className={cn(
            "text-[10px] uppercase tracking-[0.08em]",
            isOrbital ? cn(orbital.label, "text-primary/50") : "font-mono text-muted-foreground/60"
          )}
        >
          (early)
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
        <div>
          <div
            className={cn(
              "text-[10px] font-medium uppercase tracking-[0.12em]",
              isOrbital ? cn(orbital.label, "text-primary/60") : "text-muted-foreground/70"
            )}
          >
            Highlights → Orbit
          </div>
          <div
            className={cn(
              "text-xl font-semibold tabular-nums",
              isOrbital ? cn(orbital.data, "text-foreground") : "font-mono text-foreground"
            )}
          >
            {cta}
          </div>
        </div>
        <div>
          <div
            className={cn(
              "text-[10px] font-medium uppercase tracking-[0.12em]",
              isOrbital ? cn(orbital.label, "text-primary/60") : "text-muted-foreground/70"
            )}
          >
            Digest “Review together”
          </div>
          <div
            className={cn(
              "text-xl font-semibold tabular-nums",
              isOrbital ? cn(orbital.data, "text-foreground") : "font-mono text-foreground"
            )}
          >
            {digestCta}
          </div>
        </div>
        <div>
          <div
            className={cn(
              "text-[10px] font-medium uppercase tracking-[0.12em]",
              isOrbital ? cn(orbital.label, "text-primary/60") : "text-muted-foreground/70"
            )}
          >
            Good feedback
          </div>
          <div
            className={cn(
              "text-xl font-semibold tabular-nums",
              isOrbital ? cn(orbital.data, "text-emerald-400/90") : "font-mono text-emerald-400/90"
            )}
          >
            {good}
          </div>
        </div>
        <div>
          <div
            className={cn(
              "text-[10px] font-medium uppercase tracking-[0.12em]",
              isOrbital ? cn(orbital.label, "text-primary/60") : "text-muted-foreground/70"
            )}
          >
            Not relevant feedback
          </div>
          <div
            className={cn(
              "text-xl font-semibold tabular-nums",
              isOrbital ? cn(orbital.data, "text-amber-400/90") : "font-mono text-amber-400/90"
            )}
          >
            {notRel}
          </div>
        </div>
        <div>
          <div
            className={cn(
              "text-[10px] font-medium uppercase tracking-[0.12em]",
              isOrbital ? cn(orbital.label, "text-primary/60") : "text-muted-foreground/70"
            )}
          >
            Quick Pass toggles
          </div>
          <div
            className={cn(
              "text-xl font-semibold tabular-nums",
              isOrbital ? cn(orbital.data, "text-foreground") : "font-mono text-foreground"
            )}
          >
            {quick}
          </div>
        </div>
        <div>
          <div
            className={cn(
              "text-[10px] font-medium uppercase tracking-[0.12em]",
              isOrbital ? cn(orbital.label, "text-primary/60") : "text-muted-foreground/70"
            )}
          >
            Deep Review toggles
          </div>
          <div
            className={cn(
              "text-xl font-semibold tabular-nums",
              isOrbital ? cn(orbital.data, "text-foreground") : "font-mono text-foreground"
            )}
          >
            {deep}
          </div>
        </div>
        <div>
          <div
            className={cn(
              "text-[10px] font-medium uppercase tracking-[0.12em]",
              isOrbital ? cn(orbital.label, "text-primary/60") : "text-muted-foreground/70"
            )}
          >
            Digest sessions started
          </div>
          <div
            className={cn(
              "text-xl font-semibold tabular-nums",
              isOrbital ? cn(orbital.data, "text-foreground") : "font-mono text-foreground"
            )}
          >
            {sessions}
          </div>
        </div>
      </div>

      {/* Slice 2 ratios + Slice 3 per-source + Quick Pass keep outcome — all in ONE ultra-light footer row.
          Uses identical classes, hairline, opacity, mono nums, wrap. Never dominates; purely additive clarity when data exists.
          "Top sources" only for Orbit entry drivers (best/worst visible via relative %). Keep rate is the high-value Quick Pass outcome.
          Total visual delta from Slice 2: a few extra spans in the existing flex. Feels lighter and more useful, never heavier. */}
      {(digestCta > 0 || quick + deep > 0 || topEntrySources.length > 0 || quickKeeps > 0) && (
        <div
          className={cn(
            "mt-2.5 border-t pt-2 text-[10px] flex flex-wrap items-baseline gap-x-4 gap-y-0.5",
            isOrbital
              ? "border-primary/20 text-primary/60"
              : "border-hairline-soft/60 text-muted-foreground/70"
          )}
        >
          {digestCta > 0 && (
            <span>
              Digest CTA → session rate{" "}
              <span className={cn("tabular-nums", isOrbital ? cn(orbital.data, "text-primary/80") : "font-mono text-foreground/80")}>
                {Math.round(digestRate * 100)}%
              </span>
            </span>
          )}
          {quick + deep > 0 && (
            <span>
              Quick Pass share of modes{" "}
              <span className={cn("tabular-nums", isOrbital ? cn(orbital.data, "text-primary/80") : "font-mono text-foreground/80")}>
                {Math.round(quickShare * 100)}%
              </span>
            </span>
          )}
          {topEntrySources.length > 0 && (
            <span>
              Top sources{" "}
              <span className={cn("tabular-nums", isOrbital ? cn(orbital.data, "text-primary/80") : "font-mono text-foreground/80")}>
                {topEntrySources
                  .map((s) => `${sourceLabel(s.source)} ${Math.round(s.pct * 100)}%`)
                  .join(" · ")}
              </span>
            </span>
          )}
          {quickKeeps > 0 && (
            <span>
              Quick Pass keep rate{" "}
              <span className={cn("tabular-nums", isOrbital ? cn(orbital.data, "text-primary/80") : "font-mono text-foreground/80")}>
                {Math.round(quickKeepRate * 100)}%
              </span>
            </span>
          )}
        </div>
      )}

      <p
        className={cn(
          "mt-3 text-[11px]",
          isOrbital ? cn(orbital.label, "text-primary/50") : "text-muted-foreground/60"
        )}
      >
        Reliable early signal: do the rituals feed Orbit? Quick Pass adoption? Feedback loops active?
      </p>
    </RootCard>
  );
}

const RangeControl = React.memo(function RangeControl({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (v: TimeRange) => void;
}) {
  const { isOrbital } = useOrbitalTheme();
  return (
    <div
      role="tablist"
      aria-label="Time range"
      className={cn(
        "inline-flex items-center rounded-full p-0.5 text-[11px] font-medium",
        isOrbital
          ? cn(orbital.glass, "border border-primary/20")
          : "border border-hairline-soft bg-surface-2"
      )}
    >
      {RANGE_OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-full px-2.5 py-0.5 tabular-nums transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : isOrbital
                  ? cn(orbital.label, "text-primary/60 hover:text-primary")
                  : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
});

function LoadingSkeleton() {
  const { isOrbital } = useOrbitalTheme();
  const skeletonClass = (h: string) =>
    cn(
      h,
      "rounded-lg border skeleton-shimmer",
      isOrbital
        ? "border-primary/10 bg-surface-1/60"
        : "border-hairline-soft bg-surface-1"
    );
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className={skeletonClass("h-[180px]")} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div className={skeletonClass("h-[86px]")} />
          <div className={skeletonClass("h-[86px]")} />
        </div>
      </div>
      <div className={skeletonClass("h-[420px]")} />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className={skeletonClass("h-[260px]")} />
        <div className={skeletonClass("h-[260px]")} />
      </div>
      <div className={skeletonClass("h-[300px]")} />
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  const { isOrbital } = useOrbitalTheme();
  return (
    <div className="flex h-72 items-center justify-center text-center">
      <div
        className={cn(
          "rounded-2xl px-6 py-8 shadow-sm sm:px-8",
          isOrbital
            ? cn(orbital.glass, "border border-primary/20")
            : "border border-hairline-soft bg-surface-1"
        )}
      >
        <p className="text-lg font-medium">Analytics could not be loaded</p>
        <p
          className={cn(
            "mt-2 text-sm",
            isOrbital ? cn(orbital.label, "text-primary/60") : "text-muted-foreground"
          )}
        >
          {message ?? "Please try again."}
        </p>
        <Button size="sm" className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      </div>
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
