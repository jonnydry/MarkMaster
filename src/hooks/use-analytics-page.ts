"use client";

import { useCallback, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

import { useCreateCollection } from "@/hooks/use-create-collection";
import {
  useCollectionsQuery,
  useLibraryStatsQuery,
  useTagsQuery,
} from "@/hooks/use-library-data";
import {
  useSurfaceKeyboardShortcuts,
  type KeyboardShortcutGroup,
} from "@/hooks/use-keyboard-shortcuts";
import {
  computeAnnotationPct,
  computeTriagedPct,
  computeVelocityDelta,
} from "@/lib/analytics";
import { fetchJson } from "@/lib/fetch-json";
import { buildOrbitIntentHref } from "@/lib/orbit-navigation";
import { completeLibrarySync } from "@/lib/library-sync";
import type { AnalyticsData } from "@/types";
import {
  parseAnalyticsTab,
  RANGE_OPTIONS,
  type AnalyticsTab,
} from "@/app/(main)/analytics/analytics-primitives";
import type { TimeRange } from "@/app/(main)/analytics/time-range";

export const ANALYTICS_SHORTCUT_GROUPS: KeyboardShortcutGroup[] = [
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

export function useAnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: session, update: updateSession } = useSession();
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
  const { data: libraryStats } = useLibraryStatsQuery();

  const oldestOrbitHref = analytics
    ? buildOrbitIntentHref({
        intent: "oldest",
        orbitQueueCount: analytics.orbitQueueCount,
        untaggedOldestAt: analytics.untaggedOldestAt,
      })
    : "/orbit";

  const lastSyncAt = session?.dbUser?.lastSyncAt
    ? new Date(session.dbUser.lastSyncAt)
    : null;

  const triagedPct = useMemo(() => computeTriagedPct(analytics), [analytics]);
  const velocityDelta = useMemo(
    () => computeVelocityDelta(analytics),
    [analytics]
  );
  const annotationPct = useMemo(
    () => computeAnnotationPct(analytics),
    [analytics]
  );

  const goToTagOnDashboard = useCallback(
    (tagId: string) => {
      router.push(`/dashboard?tag=${encodeURIComponent(tagId)}`);
    },
    [router]
  );

  const handleCreateCollectionOpen = useCallback(() => {
    setCreateOpen(true);
  }, []);

  const handleSyncComplete = useCallback(() => {
    completeLibrarySync(queryClient, {
      updateSession: () => updateSession({ refresh: "lastSyncAt" }),
    });
  }, [queryClient, updateSession]);

  const handleTabChange = useCallback(
    (tab: AnalyticsTab) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (tab === "overview") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const query = params.toString();
      router.replace(query ? `/analytics?${query}` : "/analytics", {
        scroll: false,
      });
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

  return {
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
    isLoading,
    isError,
    error,
    refetch,
    showAnalyticsSkeleton,
    tags,
    collections,
    libraryStats,
    oldestOrbitHref,
    lastSyncAt,
    triagedPct,
    velocityDelta,
    annotationPct,
    goToTagOnDashboard,
    handleCreateCollectionOpen,
    handleSyncComplete,
    handleTabChange,
  };
}
