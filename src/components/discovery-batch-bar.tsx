"use client";

import { Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiscoveryCelebration } from "@/components/discovery-celebration";
import { cn } from "@/lib/utils";

export interface DiscoveryBatchBarProps {
  gemCount: number;
  resurfacedCount: number;
  totalEngagement: number;
  overlapWithQuickPicks: number;
  nurturedCount?: number;
  celebration?: { gems: number; engagement: number } | null;
  showExpand?: boolean;
  expanded?: boolean;
  onReviewTogether: () => void;
  onSaveAsCollection?: () => void;
  onToggleExpand?: () => void;
  expandLabel?: string;
  className?: string;
}

export function DiscoveryBatchBar({
  gemCount,
  resurfacedCount,
  totalEngagement,
  overlapWithQuickPicks,
  nurturedCount = 0,
  celebration,
  showExpand = false,
  expanded = false,
  onReviewTogether,
  onSaveAsCollection,
  onToggleExpand,
  expandLabel,
  className,
}: DiscoveryBatchBarProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {celebration ? (
        <DiscoveryCelebration
          celebration={celebration}
          prefix="Sprint ready —"
          className="px-4 py-3"
        />
      ) : null}

      <div className="surface-veil p-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Organization Sprint
          </p>
          <p className="text-xs text-muted-foreground">
            {gemCount} curated gem{gemCount === 1 ? "" : "s"}
            {overlapWithQuickPicks > 0 &&
              ` (${overlapWithQuickPicks} already in Quick picks above)`}
            {resurfacedCount > 0 && ` · ${resurfacedCount} resurfaced`}
            {totalEngagement > 0 &&
              ` · ~${totalEngagement.toLocaleString()} engagements on X`}
            {nurturedCount > 0 && ` · ${nurturedCount} sent to Orbit`}
          </p>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={onReviewTogether} className="gap-1.5">
              <RotateCcw className="h-4 w-4" />
              Organize {gemCount} together
            </Button>
            {onSaveAsCollection ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onSaveAsCollection}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Save as collection
              </Button>
            ) : null}
          </div>
          {showExpand && onToggleExpand ? (
            <Button variant="ghost" size="sm" onClick={onToggleExpand} className="text-xs">
              {expanded ? "Show fewer" : expandLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
