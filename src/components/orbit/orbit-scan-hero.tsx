"use client";

import Link from "next/link";
import { BadgeCheck, ListChecks, Loader2, Map as MapIcon } from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";
import { Button } from "@/components/ui/button";
import { useOrbitalTheme } from "@/components/providers";
import {
  orbitDataClass,
  orbitHairlineBorder,
  orbitMetaMuted,
} from "@/lib/orbit-route-chrome";
import { cn } from "@/lib/utils";

export interface OrbitScanHeroProps {
  title?: string;
  helperText: string;
  total: number;
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
}

export function OrbitScanHero({
  title = "Categorize unsorted bookmarks",
  helperText,
  total,
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
}: OrbitScanHeroProps) {
  const { isOrbital } = useOrbitalTheme();

  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b pb-4",
        orbitHairlineBorder(isOrbital)
      )}
    >
      <div className="min-w-0">
        <h1
          className={cn(
            "text-base font-semibold",
            isOrbital ? "text-foreground" : "text-white"
          )}
        >
          {title}
        </h1>
        <p
          className={cn(
            "mt-1 max-w-2xl text-sm leading-6",
            isOrbital ? "text-muted-foreground" : "text-white/65"
          )}
        >
          {helperText}
        </p>
        <div
          className={cn(
            "mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-[10px]",
            orbitHairlineBorder(isOrbital),
            orbitMetaMuted(isOrbital)
          )}
        >
          <span className={orbitDataClass(isOrbital)}>{total} unsorted</span>
          <span className={orbitDataClass(isOrbital)}>Grok</span>
        </div>
      </div>

      <div className="flex w-full flex-wrap items-center gap-2">
        <Button
          size="sm"
          className={
            isOrbital
              ? "h-9 rounded-sm border-primary/40 bg-primary px-3 text-primary-foreground shadow-sm hover:bg-primary/90"
              : "h-9 rounded-lg border-white/80 bg-foreground px-3 text-background shadow-[0_14px_30px_-22px_rgba(59,130,246,0.75)] hover:bg-foreground/90"
          }
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
                "h-9 px-3 text-emerald-100 hover:border-emerald-400/45 hover:bg-emerald-400/15 hover:text-foreground",
                isOrbital
                  ? "rounded-sm border-emerald-400/25 bg-emerald-400/10"
                  : "rounded-lg border-emerald-400/25 bg-emerald-400/10"
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
              className={
                isOrbital
                  ? "h-9 rounded-sm border-primary/30 bg-primary/10 px-3 text-primary hover:border-primary/50 hover:bg-primary/15 hover:text-foreground"
                  : "h-9 rounded-lg border-primary/30 bg-primary/10 px-3 text-sky-100 hover:border-primary/50 hover:bg-primary/15 hover:text-foreground"
              }
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

        <Link
          href={mapHref}
          className={
            isOrbital
              ? "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border border-hairline-soft bg-surface-2/70 px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10"
              : "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-white/15 bg-white/[0.045] px-3 text-sm font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
          }
        >
          <MapIcon
            className={cn("size-4", isOrbital ? "text-primary" : "text-sky-200")}
            aria-hidden
          />
          Open graph
        </Link>
      </div>

      {scanError}
    </div>
  );
}
