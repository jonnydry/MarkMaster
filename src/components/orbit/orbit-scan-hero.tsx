"use client";

import Link from "next/link";
import { BadgeCheck, ListChecks, Loader2, Map as MapIcon } from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";
import { Button } from "@/components/ui/button";
import { useOrbitalTheme } from "@/components/providers";
import {
  orbitControlRadius,
  orbitHairlineBorder,
  orbitMapLinkClass,
} from "@/lib/orbit-route-chrome";
import { cn } from "@/lib/utils";

export interface OrbitScanHeroProps {
  scanButtonLabel: string;
  queueIsLoading: boolean;
  scanning: boolean;
  scanTargetCount: number;
  hasScanPlan: boolean;
  applyingBatch: boolean;
  canApplyStrongMatches: boolean;
  mapHref: string;
  scanError?: React.ReactNode;
  onScan: () => void;
  onApplyStrongMatches: () => void;
  onReviewPass: () => void;
  /** Compact queue controls rendered under the mission buttons (view / sort / select). */
  queueToolbar?: React.ReactNode;
}

export function OrbitScanHero({
  scanButtonLabel,
  queueIsLoading,
  scanning,
  scanTargetCount,
  hasScanPlan,
  applyingBatch,
  canApplyStrongMatches,
  mapHref,
  scanError,
  onScan,
  onApplyStrongMatches,
  onReviewPass,
  queueToolbar,
}: OrbitScanHeroProps) {
  const { isOrbital } = useOrbitalTheme();

  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b pb-4",
        orbitHairlineBorder(isOrbital)
      )}
    >
      <div className="flex w-full flex-wrap items-center gap-2">
        <Button
          size="sm"
          className={cn(
            "h-9 px-3",
            orbitControlRadius(isOrbital),
            isOrbital
              ? "border-primary/40 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
              : "border-foreground/80 bg-foreground text-background shadow-[0_14px_30px_-22px_rgba(59,130,246,0.75)] hover:bg-foreground/90"
          )}
          disabled={queueIsLoading || scanning || scanTargetCount === 0}
          onClick={onScan}
        >
          {queueIsLoading || scanning ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <GrokMark className="size-4" title="Grok" />
          )}
          {scanButtonLabel}
        </Button>

        {hasScanPlan ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "h-9 px-3 text-emerald-700 hover:border-emerald-400/45 hover:bg-emerald-400/15 hover:text-foreground dark:text-emerald-100",
                orbitControlRadius(isOrbital),
                "border-emerald-400/25 bg-emerald-400/10"
              )}
              disabled={applyingBatch || !canApplyStrongMatches}
              onClick={onApplyStrongMatches}
            >
              {applyingBatch ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BadgeCheck className="size-4" />
              )}
              Apply strong matches
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "h-9 px-3 text-primary hover:border-primary/50 hover:bg-primary/15 hover:text-foreground",
                orbitControlRadius(isOrbital),
                "border-primary/30 bg-primary/10"
              )}
              disabled={applyingBatch}
              onClick={onReviewPass}
            >
              {applyingBatch ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ListChecks className="size-4" />
              )}
              Review pass
            </Button>
          </>
        ) : null}

        <Link href={mapHref} className={orbitMapLinkClass(isOrbital)}>
          <MapIcon
            className={cn("size-4", isOrbital ? "text-primary" : "text-primary")}
            aria-hidden
          />
          Open graph
        </Link>
      </div>

      {queueToolbar ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 border-t pt-3",
            orbitHairlineBorder(isOrbital)
          )}
        >
          {queueToolbar}
        </div>
      ) : null}

      {scanError}
    </div>
  );
}
