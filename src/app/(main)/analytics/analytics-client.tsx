"use client";

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
import {
  ANALYTICS_SHORTCUT_GROUPS,
  useAnalyticsPage,
} from "@/hooks/use-analytics-page";
import { AnalyticsHero, AnalyticsRangeSegment } from "./analytics-primitives";
import { AnalyticsLoadingSkeleton } from "./analytics-loading-skeleton";
import { AnalyticsTabPanel } from "./analytics-tab-panel";

export type { TimeRange } from "./time-range";

const CreateCollectionDialog = dynamic(
  () =>
    import("@/components/create-collection-dialog").then(
      (m) => m.CreateCollectionDialog
    ),
  { ssr: false }
);

export default function AnalyticsPage() {
  const page = useAnalyticsPage();
  const {
    session,
    createCollection,
    createOpen,
    setCreateOpen,
    keyboardShortcutsOpen,
    setKeyboardShortcutsOpen,
    range,
    setRange,
    activeTab,
    analytics,
    isError,
    error,
    refetch,
    showAnalyticsSkeleton,
    tags,
    collections,
    oldestOrbitHref,
    lastSyncAt,
    triagedPct,
    velocityDelta,
    annotationPct,
    goToTagOnDashboard,
    handleCreateCollectionOpen,
    handleSyncComplete,
    handleTabChange,
  } = page;

  return (
    <div className="app-shell-bg app-viewport flex overflow-hidden">
      <div className="hidden h-full min-h-0 shrink-0 overflow-hidden md:block">
        <Sidebar
          tags={tags}
          collections={collections}
          selectedTags={[]}
          onTagToggle={goToTagOnDashboard}
          onCreateCollection={handleCreateCollectionOpen}
          lastSyncAt={lastSyncAt}
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
                  onCreateCollection={handleCreateCollectionOpen}
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
                <AnalyticsLoadingSkeleton />
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
                        lastSyncAt={lastSyncAt}
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

                  <AnalyticsTabPanel
                    activeTab={activeTab}
                    analytics={analytics}
                    range={range}
                    onTabChange={handleTabChange}
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
