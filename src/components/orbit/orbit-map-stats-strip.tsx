"use client";

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
        "pointer-events-none absolute bottom-4 left-4 z-20 hidden max-w-[calc(100%-6rem)] items-center gap-3 rounded-sm border px-3 py-2 backdrop-blur-xl lg:flex",
        "border-white/[0.06] bg-[#0b1220]/58 text-white/60"
      )}
    >
      <MapMetric
        label="Loose"
        value={stats.looseBookmarks}
      />
      <MapMetricDivider />
      <MapMetric label="Tags" value={stats.tagCount} />
      <MapMetricDivider />
      <MapMetric
        label="Collections"
        value={stats.userCollectionCount + stats.xFolderCount}
      />
      {truncatedCount > 0 && (
        <>
          <MapMetricDivider />
          <MapMetric
            label="Hidden"
            value={truncatedCount}
          />
        </>
      )}
    </div>
  );
}

function MapMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "text-2xs font-medium uppercase tracking-[0.14em]",
          "text-white/35"
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-semibold tabular-nums",
          "text-white/75"
        )}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function MapMetricDivider() {
  return (
    <span
      className={cn(
        "h-6 w-px",
        "bg-white/[0.08]"
      )}
    />
  );
}
