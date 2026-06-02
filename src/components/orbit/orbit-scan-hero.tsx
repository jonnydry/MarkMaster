"use client";

import Link from "next/link";
import { BadgeCheck, ListChecks, Loader2, Map as MapIcon } from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";
import { Button } from "@/components/ui/button";
import { useOrbitalTheme } from "@/components/providers";
import {
  orbitControlRadius,
  orbitDataClass,
  orbitHairlineBorder,
  orbitLabelClass,
  orbitMapLinkClass,
  orbitMetaSoft,
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
  const workflowState = queueIsLoading
    ? "Loading queue"
    : scanning
      ? "Scanning"
      : applyingBatch
        ? "Applying"
        : hasScanPlan
          ? "Plan ready"
          : scanTargetCount > 0
            ? "Ready"
            : "Idle";
  const targetLabel =
    scanTargetCount === 1
      ? "1 target"
      : `${scanTargetCount.toLocaleString()} targets`;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-sm border",
        orbitHairlineBorder(isOrbital),
        isOrbital
          ? "glass-orbital"
          : "bg-surface-1/70 shadow-[0_18px_44px_-38px_rgba(15,23,42,0.75)] dark:bg-white/[0.035]"
      )}
    >
      <div className="flex flex-col gap-3 px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-sm border",
                orbitHairlineBorder(isOrbital),
                isOrbital
                  ? "bg-primary/10 text-primary"
                  : "bg-surface-2/80 text-primary dark:bg-white/[0.05]"
              )}
            >
              {scanning ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <GrokMark className="size-4" title="Grok" />
              )}
            </span>
            <div className="min-w-0">
              <div className={cn(orbitLabelClass(isOrbital), "text-[10px]")}>
                Orbit workflow
              </div>
              <div
                className={cn(
                  orbitDataClass(isOrbital),
                  "mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 normal-case text-[11px]",
                  orbitMetaSoft(isOrbital)
                )}
              >
                <span>{workflowState}</span>
                <span aria-hidden>·</span>
                <span>{targetLabel}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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
                className={cn(
                  "size-4",
                  isOrbital ? "text-primary" : "text-primary"
                )}
                aria-hidden
              />
              Open graph
            </Link>
          </div>
        </div>

        {queueToolbar ? (
          <div
            className={cn(
              "rounded-sm border p-2",
              orbitHairlineBorder(isOrbital),
              isOrbital ? "bg-surface-1/45" : "bg-surface-2/45 dark:bg-white/[0.025]"
            )}
          >
            {queueToolbar}
          </div>
        ) : null}
      </div>

      {scanError ? (
        <div
          className={cn(
            "border-t p-3",
            orbitHairlineBorder(isOrbital),
            isOrbital ? "bg-background/30" : "bg-background/45"
          )}
        >
          {scanError}
        </div>
      ) : null}
    </section>
  );
}
