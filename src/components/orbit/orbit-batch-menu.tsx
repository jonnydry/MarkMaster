"use client";

import { Check, ChevronDown, Lock } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { orbitLabelClass } from "@/lib/orbit-route-chrome";
import {
  ORBIT_SCAN_BATCH_PROFILES,
  type OrbitScanBatchMode,
  type OrbitScanBatchProfileId} from "@/lib/orbit-config";
import {
  highlightIdleClass,
  highlightSegmentActiveClass,
} from "@/lib/highlight-chrome";
import { cn } from "@/lib/utils";

const BATCH_OPTIONS: Array<{
  mode: OrbitScanBatchMode;
  label: string;
  detail: string;
}> = [
  { mode: "auto", label: "Auto", detail: "Adaptive — sizes itself to quality" },
  {
    mode: "quick",
    label: `Quick`,
    detail: `${ORBIT_SCAN_BATCH_PROFILES.quick.size} bookmarks · fastest pass`},
  {
    mode: "balanced",
    label: `Balanced`,
    detail: `${ORBIT_SCAN_BATCH_PROFILES.balanced.size} bookmarks · when signal is reliable`},
  {
    mode: "deep",
    label: `Deep`,
    detail: `${ORBIT_SCAN_BATCH_PROFILES.deep.size} bookmarks · richest pass`},
  {
    mode: "sweep",
    label: `Sweep`,
    detail: `${ORBIT_SCAN_BATCH_PROFILES.sweep.size} bookmarks · reuses existing tags only — never invents new ones`},
];

export interface OrbitBatchMenuProps {
  batchMode: OrbitScanBatchMode;
  resolvedBatchProfile: OrbitScanBatchProfileId;
  deepUnlocked: boolean;
  deepLockedReason: string;
  sweepUnlocked: boolean;
  sweepLockedReason: string;
  disabled?: boolean;
  onBatchModeChange: (mode: OrbitScanBatchMode) => void;
}

/**
 * Compact batch-size affordance. Demoted from the old always-on 4-segment
 * control to a caret popover that hangs off the scan CTA — advanced, not
 * equal-weight with the primary action.
 */
export function OrbitBatchMenu({
  batchMode,
  resolvedBatchProfile,
  deepUnlocked,
  deepLockedReason,
  sweepUnlocked,
  sweepLockedReason,
  disabled = false,
  onBatchModeChange,
}: OrbitBatchMenuProps) {

  const triggerLabel =
    batchMode === "auto"
      ? `Auto · ${ORBIT_SCAN_BATCH_PROFILES[resolvedBatchProfile].label}`
      : ORBIT_SCAN_BATCH_PROFILES[batchMode].label;

  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        aria-label={`Scan batch size: ${triggerLabel}`}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1 rounded-sm border border-hairline-strong bg-background/35 px-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-hover disabled:pointer-events-none disabled:opacity-50"
        )}
        title={`Batch size — ${triggerLabel}`}
      >
        <span className="hidden sm:inline">{triggerLabel}</span>
        <span className="sm:hidden">
          {batchMode === "auto"
            ? "Auto"
            : ORBIT_SCAN_BATCH_PROFILES[batchMode].size}
        </span>
        <ChevronDown className="size-3 opacity-60" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-1 p-1.5">
        <div
          className={cn(
            orbitLabelClass(),
            "px-2 pb-1 pt-1.5 text-2xs",
            "text-muted-foreground"
          )}
        >
          Scan batch size
        </div>
        {BATCH_OPTIONS.map((option) => {
          const active = batchMode === option.mode;
          const locked =
            (option.mode === "deep" && !deepUnlocked) ||
            (option.mode === "sweep" && !sweepUnlocked);
          const lockedReason =
            option.mode === "sweep" ? sweepLockedReason : deepLockedReason;
          return (
            <button
              key={option.mode}
              type="button"
              disabled={locked}
              aria-pressed={active}
              onClick={() => onBatchModeChange(option.mode)}
              title={locked ? lockedReason : option.detail}
              className={cn(
                "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors",
                active
                  ? highlightSegmentActiveClass
                  : cn("text-foreground", highlightIdleClass),
                locked && "cursor-not-allowed opacity-55 hover:bg-transparent"
              )}
            >
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                {active ? (
                  <Check className="size-3.5" aria-hidden />
                ) : locked ? (
                  <Lock className="size-3 opacity-70" aria-hidden />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold">
                  {option.label}
                </span>
                <span
                  className={cn(
                    "block text-2xs leading-4",
                    "text-muted-foreground"
                  )}
                >
                  {locked ? lockedReason : option.detail}
                </span>
              </span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
