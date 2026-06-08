"use client";

import dynamic from "next/dynamic";

import {
  AnalyticsTabs,
  FlywheelSignalsPanel,
  type AnalyticsTab,
} from "./analytics-primitives";
import type { AnalyticsData } from "@/types";
import type { TimeRange } from "./time-range";

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
  );
}
