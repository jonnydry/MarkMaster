"use client";

import { useOrbitalTheme } from "@/components/providers";
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
  const { isOrbital } = useOrbitalTheme();

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-4 left-4 z-20 hidden max-w-[calc(100%-6rem)] items-center gap-3 rounded-sm border px-3 py-2 backdrop-blur-xl lg:flex",
        isOrbital
          ? "border-hairline-soft bg-surface-1/75 text-muted-foreground"
          : "border-white/[0.06] bg-[#0b1220]/58 text-white/60"
      )}
    >
      <MapMetric
        label="Loose"
        value={stats.looseBookmarks}
        isOrbital={isOrbital}
      />
      <MapMetricDivider isOrbital={isOrbital} />
      <MapMetric label="Tags" value={stats.tagCount} isOrbital={isOrbital} />
      <MapMetricDivider isOrbital={isOrbital} />
      <MapMetric
        label="Collections"
        value={stats.userCollectionCount + stats.xFolderCount}
        isOrbital={isOrbital}
      />
      {truncatedCount > 0 && (
        <>
          <MapMetricDivider isOrbital={isOrbital} />
          <MapMetric
            label="Hidden"
            value={truncatedCount}
            isOrbital={isOrbital}
          />
        </>
      )}
    </div>
  );
}

function MapMetric({
  label,
  value,
  isOrbital,
}: {
  label: string;
  value: number;
  isOrbital: boolean;
}) {
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "text-[10px] font-medium uppercase tracking-[0.2em]",
          isOrbital ? "text-muted-foreground" : "text-white/35"
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-semibold tabular-nums",
          isOrbital ? "text-foreground" : "text-white/75"
        )}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function MapMetricDivider({ isOrbital }: { isOrbital: boolean }) {
  return (
    <span
      className={cn(
        "h-6 w-px",
        isOrbital ? "bg-hairline-soft" : "bg-white/[0.08]"
      )}
    />
  );
}
