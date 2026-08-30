"use client";

import Link from "next/link";
import { Loader2, RefreshCw, Settings2 } from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";
import { orbital } from "@/components/orbital";
import { Button, buttonVariants } from "@/components/ui/button";
import type { OrbitScanFailure } from "@/hooks/use-orbit-scan";
import { getScanFailurePresentation } from "@/lib/orbit-scan-presentation";
import { orbitMetaMuted } from "@/lib/orbit-route-chrome";
import { cn } from "@/lib/utils";

export function OrbitScanFailureNotice({
  error,
  retryTargetCount,
  selectionTargetCount,
  canRescanCurrentSelection,
  scanning,
  onRetry,
  onRescanCurrentSelection,
}: {
  error: OrbitScanFailure;
  retryTargetCount: number;
  selectionTargetCount: number;
  canRescanCurrentSelection: boolean;
  scanning: boolean;
  onRetry: () => void;
  onRescanCurrentSelection: () => void;
}) {
  const presentation = getScanFailurePresentation(error);
  const Icon = presentation.Icon;

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-sm border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        presentation.panelClassName
      )}
    >
      <div className="flex min-w-0 gap-3">
        <div className="surface-inset-strong mt-0.5 flex size-8 shrink-0 items-center justify-center">
          <Icon className={cn("size-4", presentation.iconClassName)} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                orbital.label,
                "inline-flex items-center rounded-sm border px-2 py-0.5 text-2xs font-medium uppercase tracking-[0.14em]",
                presentation.badgeClassName
              )}
            >
              {presentation.label}
            </span>
            <p className="text-sm font-semibold text-foreground">
              {error.title}
            </p>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {error.message}
          </p>
          <p className={cn("mt-1 text-xs leading-5", orbitMetaMuted())}>
            {presentation.helper}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="surface-inset-strong h-9 text-foreground hover:bg-accent-soft"
          disabled={scanning || retryTargetCount === 0}
          onClick={onRetry}
        >
          {scanning ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Retry last scan
        </Button>

        {error.recoveryHref ? (
          <Link
            href={error.recoveryHref}
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "surface-inset-strong h-9 text-foreground hover:bg-accent-soft"
            )}
          >
            <Settings2 className="size-3.5" />
            {error.recoveryLabel ?? "Open Settings"}
          </Link>
        ) : null}

        {canRescanCurrentSelection ? (
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-sm bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={scanning || selectionTargetCount === 0}
            onClick={onRescanCurrentSelection}
          >
            {scanning ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <GrokMark className="size-3.5" title="Grok" />
            )}
            Rescan selection
          </Button>
        ) : null}
      </div>
    </div>
  );
}
