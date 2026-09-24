"use client";

import { orbitMapFloatingShellClass } from "@/lib/orbit-map-chrome";
import { cn } from "@/lib/utils";
import type { OrbitGraphStats } from "@/types";

interface OrbitMapStatsStripProps {
  stats: OrbitGraphStats;
  truncatedCount: number;
}

export function OrbitMapStatsStrip({
  stats,
  truncatedCount,
}: OrbitMapStatsStripProps) {
  return (
    <div
      className={cn(
        orbitMapFloatingShellClass(),
        "pointer-events-none absolute bottom-4 left-3 z-20 flex max-w-[calc(100%-7.5rem)] items-center gap-3 overflow-x-auto px-2.5 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] lg:left-4 lg:max-w-[calc(100%-6rem)] lg:px-3 lg:py-2 [&::-webkit-scrollbar]:hidden"
      )}
    >
      <MapMetric
        label="Loose"
        value={stats.looseBookmarks}
        title="In Orbit — not on a tag or collection"
      />
      <MapMetricDivider />
      <MapMetric label="Tags" value={stats.tagCount} />
      <MapMetricDivider />
      <MapMetric
        label="Collections"
        value={stats.userCollectionCount + stats.xFolderCount}
      />
      {truncatedCount > 0 ? (
        <>
          <MapMetricDivider />
          <MapMetric label="Hidden" value={truncatedCount} />
        </>
      ) : null}
    </div>
  );
}

function MapMetric({
  label,
  value,
  title,
}: {
  label: string;
  value: number;
  title?: string;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground"
      title={title}
    >
      <span className="font-medium">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">
        {value.toLocaleString()}
      </span>
    </span>
  );
}

function MapMetricDivider() {
  return <span className="h-4 w-px shrink-0 bg-hairline-soft" />;
}
