"use client";

import { useCallback, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { BarChart3 } from "lucide-react";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { PageHeader } from "@/components/page-header";
import { Sidebar } from "@/components/sidebar-dynamic";
import { SyncButton } from "@/components/sync-button";
import { UserNavDynamic } from "@/components/user-nav-dynamic";
import { KeyboardShortcutsHelpButton } from "@/components/keyboard-shortcuts-help-button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { RetryButton } from "@/components/ui/retry-button";
import { useCreateCollection } from "@/hooks/use-create-collection";
import { useCollectionsQuery, useTagsQuery } from "@/hooks/use-library-data";
import {
  useSurfaceKeyboardShortcuts,
  type KeyboardShortcutGroup,
} from "@/hooks/use-keyboard-shortcuts";
import { fetchJson } from "@/lib/fetch-json";
import { buildOrbitIntentHref } from "@/lib/orbit-navigation";
import { invalidateLibraryQueries } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";
import type { AnalyticsData } from "@/types";
import type { TimeRange } from "./time-range";
import {
  AnalyticsHero,
  AnalyticsRangeSegment,
  AnalyticsTabs,
  RANGE_OPTIONS,
  FlywheelSignalsPanel,
  parseAnalyticsTab,
  type AnalyticsTab,
} from "./analytics-primitives";

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

const ANALYTICS_SHORTCUT_GROUPS: KeyboardShortcutGroup[] = [
  {
    title: "Analytics Tabs",
    shortcuts: [
      { id: "tab-overview", keys: ["1"], label: "Overview" },
      { id: "tab-composition", keys: ["2"], label: "Composition" },
      { id: "tab-activity", keys: ["3"], label: "Activity" },
      { id: "tab-signals", keys: ["4"], label: "Signals" },
    ],
  },
  {
    title: "Analysis Actions",
    shortcuts: [
      { id: "range-previous", keys: ["["], label: "Previous time range" },
      { id: "range-next", keys: ["]"], label: "Next time range" },
      { id: "open-orbit", keys: ["O"], label: "Open Orbit triage" },
      { id: "shortcuts", keys: ["?"], label: "Keyboard shortcuts" },
    ],
  },
];

export default function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { createCollection } = useCreateCollection();
  const [createOpen, setCreateOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [range, setRange] = useState<TimeRange>("90d");
  const activeTab = parseAnalyticsTab(searchParams.get("tab"));

  const {
    data: analytics,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<AnalyticsData>({
    queryKey: ["analytics", range],
    queryFn: () => fetchJson(`/api/analytics?range=${range}`),
    placeholderData: keepPreviousData,
  });

  const showAnalyticsSkeleton = isLoading && !analytics;

  const { data: tags = [] } = useTagsQuery();
  const { data: collections = [] } = useCollectionsQuery();

  const oldestOrbitHref = analytics
    ? buildOrbitIntentHref({
        intent: "oldest",
        orbitQueueCount: analytics.orbitQueueCount,
        untaggedOldestAt: analytics.untaggedOldestAt,
      })
    : "/orbit";

  const goToTagOnDashboard = (tagId: string) => {
    router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
  };

  const handleSyncComplete = useCallback(() => {
    void invalidateLibraryQueries(queryClient, { refetchType: "all" });
    void queryClient.invalidateQueries({ queryKey: ["analytics"] });
  }, [queryClient]);

  const handleTabChange = useCallback(
    (tab: AnalyticsTab) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (tab === "overview") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const query = params.toString();
      router.replace(query ? `/analytics?${query}` : "/analytics", { scroll: false });
    },
    [router, searchParams]
  );

  const changeRangeByOffset = useCallback(
    (offset: -1 | 1) => {
      const currentIndex = RANGE_OPTIONS.findIndex((option) => option.value === range);
      const nextIndex = Math.max(
        0,
        Math.min(RANGE_OPTIONS.length - 1, currentIndex + offset)
      );
      setRange(RANGE_OPTIONS[nextIndex]?.value ?? range);
    },
    [range]
  );

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

  useSurfaceKeyboardShortcuts({
    shortcutGroups: ANALYTICS_SHORTCUT_GROUPS,
    actions: {
      "tab-overview": () => handleTabChange("overview"),
      "tab-composition": () => handleTabChange("composition"),
      "tab-activity": () => handleTabChange("activity"),
      "tab-signals": () => handleTabChange("signals"),
      "range-previous": () => changeRangeByOffset(-1),
      "range-next": () => changeRangeByOffset(1),
      "open-orbit": () => router.push(oldestOrbitHref),
      shortcuts: () => setKeyboardShortcutsOpen(true),
    },
  });

  return (
    <div className="app-shell-bg app-viewport flex overflow-hidden">
      <div className="hidden h-full min-h-0 shrink-0 overflow-hidden md:block">
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={[]}
          onTagToggle={goToTagOnDashboard}
          onCreateCollection={() => setCreateOpen(true)}
          lastSyncAt={
            session?.dbUser?.lastSyncAt ? new Date(session.dbUser.lastSyncAt) : null
          }
          onSyncComplete={handleSyncComplete}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="app-main-scroll scrollbar-thin">
          <PageHeader
            sticky
            title="Analytics"
            description="Library health, composition, and activity"
            leading={
              <div className="md:hidden">
                <MobileSidebar
                  tags={tags}
                  collections={collections}
                  selectedTags={[]}
                  onTagToggle={goToTagOnDashboard}
                  onCreateCollection={() => setCreateOpen(true)}
                  onSyncComplete={handleSyncComplete}
                />
              </div>
            }
            actions={
              <div className="flex items-center gap-2">
                <KeyboardShortcutsHelpButton
                  open={keyboardShortcutsOpen}
                  onOpenChange={setKeyboardShortcutsOpen}
                  groups={ANALYTICS_SHORTCUT_GROUPS}
                  description="Analytics tab, range, and Orbit triage shortcuts."
                />
                {!showAnalyticsSkeleton && analytics && analytics.totalBookmarks > 0 ? (
                  <AnalyticsRangeSegment value={range} onChange={setRange} />
                ) : null}
                {session?.dbUser ? <UserNavDynamic user={session.dbUser} /> : null}
              </div>
            }
          />

          <div className="p-4 sm:p-5">
            <div className="mx-auto w-full max-w-4xl">
              {showAnalyticsSkeleton ? (
                <LoadingSkeleton />
              ) : isError || !analytics ? (
                <ErrorState
                  title="Analytics could not be loaded"
                  description={
                    error instanceof Error ? error.message : "Please try again."
                  }
                  action={<RetryButton onClick={() => refetch()} />}
                />
              ) : analytics.totalBookmarks === 0 ? (
                <EmptyState
                  layout="panel"
                  icon={BarChart3}
                  title="No bookmarks yet"
                  description="Sync from X to see library health, top voices, and activity trends."
                  action={
                    <div className="mx-auto max-w-sm">
                      <SyncButton
                        lastSyncAt={
                          session?.dbUser?.lastSyncAt
                            ? new Date(session.dbUser.lastSyncAt)
                            : null
                        }
                        onSyncComplete={handleSyncComplete}
                        detail="full"
                      />
                    </div>
                  }
                />
              ) : (
                <>
                  <AnalyticsHero
                    totalBookmarks={analytics.totalBookmarks}
                    orbitQueueCount={analytics.orbitQueueCount}
                    untaggedCount={analytics.untaggedCount}
                    triagedPct={triagedPct}
                    last30d={analytics.last30dCount}
                    velocityDelta={velocityDelta}
                    notedCount={analytics.notedCount}
                    annotationPct={annotationPct}
                    oldestAt={analytics.untaggedOldestAt}
                    orbitHref={oldestOrbitHref}
                    lastSyncAt={session?.dbUser?.lastSyncAt ?? null}
                  />

                  <AnalyticsTabs
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                    className="mt-6"
                  />

                  <div role="tabpanel" aria-label={activeTab} className="min-h-[12rem]">
                    {activeTab === "overview" ? (
                      <TopVoicesCard
                        authors={analytics.topAuthors}
                        totalBookmarks={analytics.totalBookmarks}
                        variant="flat"
                      />
                    ) : null}

                    {activeTab === "composition" ? (
                      <div className="grid gap-0 xl:grid-cols-2 xl:gap-8">
                        <ContentMixCard breakdown={analytics.mediaBreakdown} variant="flat" />
                        <TagRankCard tags={analytics.tagDistribution} variant="flat" />
                      </div>
                    ) : null}

                    {activeTab === "activity" ? (
                      <TimelineCard analytics={analytics} range={range} variant="flat" />
                    ) : null}

                    {activeTab === "signals" ? (
                      <FlywheelSignalsPanel analytics={analytics} />
                    ) : null}
                  </div>

                  <p className="mt-4 border-t border-hairline-soft pt-3 text-xs text-muted-foreground">
                    Time range applies to activity charts and flywheel signals. Author, tag, and
                    health stats reflect your full library.
                  </p>
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

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3 border-b border-hairline-soft pb-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-16 rounded skeleton-shimmer" />
              <div className="h-6 w-12 rounded skeleton-shimmer" />
            </div>
          ))}
        </div>
        <div className="h-1.5 w-full rounded-full skeleton-shimmer" />
      </div>
      <div className="flex gap-4 border-b border-hairline-soft pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 w-16 rounded skeleton-shimmer" />
        ))}
      </div>
      <div className={cn("h-64 rounded-sm border border-hairline-soft skeleton-shimmer")} />
    </div>
  );
}
