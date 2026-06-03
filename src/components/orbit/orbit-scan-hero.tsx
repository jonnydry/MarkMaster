"use client";

import Link from "next/link";
import {
  BadgeCheck,
  ListChecks,
  Loader2,
  Map as MapIcon,
  RefreshCw,
} from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";
import { Button } from "@/components/ui/button";
import { useOrbitalTheme } from "@/components/providers";
import {
  orbitControlRadius,
  orbitDataClass,
  orbitHairlineBorder,
  orbitLabelClass,
  orbitMetaSoft,
} from "@/lib/orbit-route-chrome";
import { cn } from "@/lib/utils";

export interface OrbitScanHeroProps {
  scanButtonLabel: string;
  queueIsLoading: boolean;
  scanning: boolean;
  scanTargetCount: number;
  hasScanPlan: boolean;
  scanPlanSuggestionCount?: number;
  applyingBatch: boolean;
  canApplyStrongMatches: boolean;
  mapHref: string;
  scanError?: React.ReactNode;
  onScan: () => void;
  onApplyStrongMatches: () => void;
  onReviewPass: () => void;
}

export function OrbitScanProgressBar() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-1 overflow-hidden bg-primary/10"
      aria-hidden="true"
    >
      <div className="orbit-scan-progress-bar h-full w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent" />
    </div>
  );
}

export function OrbitScanHero({
  scanButtonLabel,
  queueIsLoading,
  scanning,
  scanTargetCount,
  hasScanPlan,
  scanPlanSuggestionCount = 0,
  applyingBatch,
  canApplyStrongMatches,
  mapHref,
  scanError,
  onScan,
  onApplyStrongMatches,
  onReviewPass,
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
  const suggestionLabel =
    scanPlanSuggestionCount === 1
      ? "1 suggestion"
      : `${scanPlanSuggestionCount.toLocaleString()} suggestions`;
  const statusLabel = hasScanPlan ? suggestionLabel : targetLabel;
  const primaryScanLabel =
    queueIsLoading || scanning ? "Categorizing queue..." : scanButtonLabel;

  if (hasScanPlan) {
    return (
      <section
        aria-busy={scanning}
        className={cn(
          "relative overflow-hidden rounded-sm border",
          orbitHairlineBorder(isOrbital),
          isOrbital
            ? "glass-orbital"
            : "bg-surface-1/70 shadow-[0_18px_44px_-38px_rgba(15,23,42,0.75)] dark:bg-white/[0.035]"
        )}
      >
        {scanning ? <OrbitScanProgressBar /> : null}

        <div className="flex min-h-12 flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-sm border border-primary/25 bg-primary/10 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary",
                orbitControlRadius(isOrbital)
              )}
            >
              <GrokMark className="size-3.5" title="Grok" />
              Plan ready
            </span>
            <span
              className={cn(
                orbitDataClass(isOrbital),
                "inline-flex h-7 items-center rounded-sm border border-hairline-soft bg-surface-2/65 px-2 text-[10px] normal-case",
                orbitMetaSoft(isOrbital)
              )}
            >
              {suggestionLabel}
            </span>
          </div>

          <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
            <Button
              type="button"
              size="sm"
              className={cn(
                "h-8 shrink-0 gap-1.5 px-3 text-xs",
                orbitControlRadius(isOrbital),
                "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
              disabled={scanning || applyingBatch}
              onClick={onReviewPass}
            >
              {applyingBatch ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ListChecks className="size-3.5" />
              )}
              Review pass
            </Button>

            <Button
              type="button"
              size="icon"
              variant="outline"
              className={cn(
                "size-8 shrink-0 border-hairline-soft bg-surface-2/70 text-foreground hover:border-primary/30 hover:bg-accent-soft",
                orbitControlRadius(isOrbital)
              )}
              disabled={queueIsLoading || scanning || scanTargetCount === 0}
              onClick={onScan}
              aria-label={scanButtonLabel}
              title={scanButtonLabel}
            >
              {queueIsLoading || scanning ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
            </Button>

            <Button
              type="button"
              size="icon"
              variant="outline"
              className={cn(
                "size-8 shrink-0 border-emerald-400/25 bg-emerald-400/10 text-emerald-700 hover:border-emerald-400/45 hover:bg-emerald-400/15 hover:text-foreground dark:text-emerald-100",
                orbitControlRadius(isOrbital)
              )}
              disabled={scanning || applyingBatch || !canApplyStrongMatches}
              onClick={onApplyStrongMatches}
              aria-label="Apply strong matches"
              title="Apply strong matches"
            >
              {applyingBatch ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <BadgeCheck className="size-3.5" />
              )}
            </Button>

            <Link
              href={mapHref}
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-sm border border-hairline-soft bg-surface-2/70 text-foreground transition-colors hover:border-primary/30 hover:bg-accent-soft",
                orbitControlRadius(isOrbital)
              )}
              aria-label="Open graph"
              title="Open graph"
            >
              <MapIcon className="size-3.5 text-primary" aria-hidden />
            </Link>
          </div>
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

  return (
    <section
      aria-busy={scanning}
      className={cn(
        "relative overflow-hidden rounded-sm border",
        orbitHairlineBorder(isOrbital),
        isOrbital
          ? "glass-orbital"
          : "bg-surface-1/70 shadow-[0_18px_44px_-38px_rgba(15,23,42,0.75)] dark:bg-white/[0.035]"
      )}
    >
      {scanning ? <OrbitScanProgressBar /> : null}

      <div className="flex flex-col gap-2.5 px-3 py-2.5 pt-3 sm:px-3.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-sm border",
              orbitHairlineBorder(isOrbital),
              isOrbital
                ? "bg-primary/10 text-primary"
                : "bg-surface-2/80 text-primary dark:bg-white/[0.05]"
            )}
          >
            {scanning ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <GrokMark className="size-3.5" title="Grok" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className={cn(orbitLabelClass(isOrbital), "text-[9px]")}>
              Orbit workflow
            </div>
            <div
              role={scanning ? "status" : undefined}
              aria-live={scanning ? "polite" : undefined}
              className={cn(
                orbitDataClass(isOrbital),
                "mt-1 flex min-w-0 flex-wrap items-center gap-1.5 normal-case text-[10px]",
                orbitMetaSoft(isOrbital)
              )}
            >
              <span className="rounded-sm border border-hairline-soft bg-surface-1/70 px-1.5 py-0.5">
                {workflowState}
              </span>
              <span className="rounded-sm border border-hairline-soft bg-surface-1/70 px-1.5 py-0.5">
                {statusLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-1.5 lg:w-auto lg:justify-end">
          {hasScanPlan ? (
            <Button
              type="button"
              size="sm"
              className={cn(
                "h-8 flex-1 gap-1.5 px-3 text-xs sm:flex-none",
                orbitControlRadius(isOrbital),
                "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
              disabled={scanning || applyingBatch}
              onClick={onReviewPass}
            >
              {applyingBatch ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ListChecks className="size-3.5" />
              )}
              Review pass
            </Button>
          ) : null}

          <Button
            size="sm"
            variant={hasScanPlan ? "outline" : "default"}
            className={cn(
              "h-8 flex-1 gap-1.5 px-3 text-xs sm:flex-none",
              orbitControlRadius(isOrbital),
              hasScanPlan
                ? "border-hairline-soft bg-surface-2/70 text-foreground hover:border-primary/30 hover:bg-accent-soft"
                : isOrbital
                  ? "border-primary/40 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                  : "border-foreground/80 bg-foreground text-background shadow-[0_14px_30px_-22px_rgba(59,130,246,0.75)] hover:bg-foreground/90"
            )}
            disabled={queueIsLoading || scanning || scanTargetCount === 0}
            onClick={onScan}
          >
            {queueIsLoading || scanning ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <GrokMark className="size-3.5" title="Grok" />
            )}
            {primaryScanLabel}
          </Button>

          {hasScanPlan ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "h-8 flex-1 gap-1.5 px-3 text-xs text-emerald-700 hover:border-emerald-400/45 hover:bg-emerald-400/15 hover:text-foreground sm:flex-none dark:text-emerald-100",
                orbitControlRadius(isOrbital),
                "border-emerald-400/25 bg-emerald-400/10"
              )}
              disabled={scanning || applyingBatch || !canApplyStrongMatches}
              onClick={onApplyStrongMatches}
            >
              {applyingBatch ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <BadgeCheck className="size-3.5" />
              )}
              Strong matches
            </Button>
          ) : null}

          <Link
            href={mapHref}
            className={cn(
              "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-sm border border-hairline-soft bg-surface-2/70 px-3 text-xs font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-accent-soft sm:flex-none",
              orbitControlRadius(isOrbital)
            )}
          >
            <MapIcon className="size-3.5 text-primary" aria-hidden />
            Graph
          </Link>
        </div>
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
