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
    <>
      <div
        className={cn(
          orbitMapFloatingShellClass(),
          "pointer-events-none absolute bottom-4 left-4 z-20 hidden max-w-[calc(100%-6rem)] items-center gap-3 px-3 py-2 lg:flex"
        )}
      >
        <MapMetric label="Loose" value={stats.looseBookmarks} />
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
            <MapMetric label="Hidden" value={truncatedCount} />
          </>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-center gap-2.5 px-2 py-1 lg:hidden">
        <CompactMetric label="Loose" value={stats.looseBookmarks} />
        <CompactMetric label="Tags" value={stats.tagCount} />
        <CompactMetric label="Collections" value={stats.userCollectionCount + stats.xFolderCount} />
        {truncatedCount > 0 && <CompactMetric label="Hidden" value={truncatedCount} />}
      </div>
    </>
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
      <p className="text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
        {label}
      </p>
      <p className="text-sm font-semibold tabular-nums text-foreground/85">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function MapMetricDivider() {
  return <span className="h-6 w-px bg-hairline-soft" />;
}

function CompactMetric({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground/80">
      <span className="font-medium uppercase tracking-[0.14em]">{label}</span>
      <span className="tabular-nums font-semibold text-foreground/85">{value.toLocaleString()}</span>
    </span>
  );
}
