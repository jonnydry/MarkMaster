"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

import {
  AnalyticsTabs,
  FlywheelSignalsPanel,
  type AnalyticsTab,
} from "./analytics-primitives";
import { TopVoicesCard } from "./top-voices-card";
import type { AnalyticsData } from "@/types";
import type { TimeRange } from "./time-range";

const ContentMixCard = dynamic(
  () => import("./content-mix-card").then((m) => m.ContentMixCard),
  { ssr: false }
);
const TagRankCard = dynamic(
  () => import("./tag-rank-card").then((m) => m.TagRankCard),
  { ssr: false }
);
const TimelineCard = dynamic(
  () => import("./timeline-card").then((m) => m.TimelineCard),
  { ssr: false }
);

type AnalyticsTabPanelProps = {
  activeTab: AnalyticsTab;
  analytics: AnalyticsData;
  range: TimeRange;
  onTabChange: (tab: AnalyticsTab) => void;
};

export function AnalyticsTabPanel({
  activeTab,
  analytics,
  range,
  onTabChange,
}: AnalyticsTabPanelProps) {
  return (
    <>
      <AnalyticsTabs
        activeTab={activeTab}
        onTabChange={onTabChange}
        className="mt-6"
      />

      <div
        key={activeTab}
        role="tabpanel"
        aria-labelledby={`analytics-tab-${activeTab}`}
        className="animate-fade-in min-h-[12rem]"
      >
        {activeTab === "overview" ? (
          <TopVoicesCard
            authors={analytics.topAuthors}
            totalBookmarks={analytics.totalBookmarks}
            variant="flat"
          />
        ) : null}

        {activeTab === "composition" ? (
          <Suspense
            fallback={
              <div className="grid gap-0 xl:grid-cols-2 xl:gap-8">
                <div className="h-64 surface-inset skeleton-shimmer" />
                <div className="h-64 surface-inset skeleton-shimmer" />
              </div>
            }
          >
            <div className="grid gap-0 xl:grid-cols-2 xl:gap-8">
              <ContentMixCard breakdown={analytics.mediaBreakdown} variant="flat" />
              <TagRankCard tags={analytics.tagDistribution} variant="flat" />
            </div>
          </Suspense>
        ) : null}

        {activeTab === "activity" ? (
          <Suspense
            fallback={<div className="h-64 surface-inset skeleton-shimmer" />}
          >
            <TimelineCard analytics={analytics} range={range} variant="flat" />
          </Suspense>
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
  );
}
