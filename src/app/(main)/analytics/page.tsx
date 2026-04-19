"use client";

import { useMemo, useState } from "react";
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
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import { fetchJson } from "@/lib/fetch-json";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";
import type { AnalyticsData } from "@/types";
import type { TimeRange } from "./time-range";

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
    <div className="app-shell-bg flex h-screen overflow-x-hidden">
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
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
                <EmptyState />
              ) : (
                <>
                  <section className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                    <LibraryHealthCard
                      untaggedCount={analytics.untaggedCount}
                      totalBookmarks={analytics.totalBookmarks}
                      triagedPct={triagedPct}
                      oldestAt={analytics.untaggedOldestAt}
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
                    rangeControl={<RangeControl value={range} onChange={setRange} />}
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
  totalBookmarks,
  triagedPct,
  oldestAt,
}: {
  untaggedCount: number;
  totalBookmarks: number;
  triagedPct: number;
  oldestAt: string | null;
}) {
  const untaggedPct = 100 - triagedPct;
  const oldestLabel = oldestAt
    ? relativeOldest(new Date(oldestAt))
    : null;
  const allTriaged = untaggedCount === 0;

  return (
    <Card className="relative overflow-hidden border-hairline-soft bg-surface-1 p-5 shadow-sm animate-fade-in-up">
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
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Library Health
            </h2>
          </div>
          <p className="mt-4 heading-font text-4xl font-bold tracking-tight tabular-nums">
            {allTriaged ? "All tagged" : untaggedCount.toLocaleString()}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {allTriaged
              ? `Every one of your ${totalBookmarks.toLocaleString()} bookmarks is organized.`
              : `untriaged · ${untaggedPct.toFixed(0)}% of ${totalBookmarks.toLocaleString()}`}
          </p>
          {oldestLabel && !allTriaged ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Oldest waiting since {oldestLabel}
            </p>
          ) : null}
        </div>

        {!allTriaged ? (
          <Link
            href="/dashboard"
            className={`${buttonVariants({ size: "sm" })} shrink-0`}
          >
            Triage now
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      <div className="relative mt-5">
        <div className="flex justify-between text-[11px] font-medium tabular-nums text-muted-foreground">
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
    </Card>
  );
}

function VelocityCard({
  last30d,
  delta,
}: {
  last30d: number;
  delta: { pct: number | null; abs: number } | null;
}) {
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

  return (
    <Card className="relative overflow-hidden border-hairline-soft bg-surface-1 p-4 shadow-sm animate-fade-in-up stagger-1">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Last 30 days
          </p>
          <p className="mt-2 heading-font text-2xl font-bold tabular-nums">
            {last30d.toLocaleString()}
          </p>
          <p className={`mt-1 flex items-center gap-1 text-xs ${deltaTone}`}>
            <Icon className="h-3 w-3" />
            {deltaLabel}
          </p>
        </div>
      </div>
    </Card>
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
  return (
    <Card className="relative overflow-hidden border-hairline-soft bg-surface-1 p-4 shadow-sm animate-fade-in-up stagger-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Annotated
          </p>
          <p className="mt-2 heading-font text-2xl font-bold tabular-nums">
            {pct.toFixed(0)}%
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {notedCount.toLocaleString()} of {totalBookmarks.toLocaleString()} with notes
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald/10 text-emerald">
          <StickyNote className="h-4 w-4" />
        </span>
      </div>
    </Card>
  );
}

function RangeControl({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (v: TimeRange) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Time range"
      className="inline-flex items-center rounded-full border border-hairline-soft bg-surface-2 p-0.5 text-[11px] font-medium"
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
            className={`rounded-full px-2.5 py-0.5 tabular-nums transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="h-[180px] rounded-lg border border-hairline-soft bg-surface-1 skeleton-shimmer" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div className="h-[86px] rounded-lg border border-hairline-soft bg-surface-1 skeleton-shimmer" />
          <div className="h-[86px] rounded-lg border border-hairline-soft bg-surface-1 skeleton-shimmer" />
        </div>
      </div>
      <div className="h-[420px] rounded-lg border border-hairline-soft bg-surface-1 skeleton-shimmer" />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="h-[260px] rounded-lg border border-hairline-soft bg-surface-1 skeleton-shimmer" />
        <div className="h-[260px] rounded-lg border border-hairline-soft bg-surface-1 skeleton-shimmer" />
      </div>
      <div className="h-[300px] rounded-lg border border-hairline-soft bg-surface-1 skeleton-shimmer" />
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
  return (
    <div className="flex h-72 items-center justify-center text-center">
      <div className="rounded-2xl border border-hairline-soft bg-surface-1 px-6 py-8 shadow-sm sm:px-8">
        <p className="text-lg font-medium">Analytics could not be loaded</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {message ?? "Please try again."}
        </p>
        <Button size="sm" className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-center">
      <div className="max-w-sm rounded-2xl border border-hairline-soft bg-surface-1 px-6 py-10 shadow-sm">
        <p className="heading-font text-xl font-semibold">Nothing to analyze yet</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Sync your X bookmarks to see how your library grows, what kind of
          content fills it, and which voices you keep coming back to.
        </p>
        <Link href="/dashboard" className={`${buttonVariants()} mt-5`}>
          Go to dashboard
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Link>
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
