"use client";

import { Check, ChevronDown, Lock } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  orbitControlRadius,
  orbitLabelClass,
  orbitMetaMuted} from "@/lib/orbit-route-chrome";
import {
  ORBIT_SCAN_BATCH_PROFILES,
  type OrbitScanBatchMode,
  type OrbitScanBatchProfileId} from "@/lib/orbit-config";
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
    detail: `${ORBIT_SCAN_BATCH_PROFILES.deep.size} bookmarks · largest pass`},
];

export interface OrbitBatchMenuProps {
  batchMode: OrbitScanBatchMode;
  resolvedBatchProfile: OrbitScanBatchProfileId;
  deepUnlocked: boolean;
  deepLockedReason: string;
  disabled?: boolean;
  onBatchModeChange: (mode: OrbitScanBatchMode) => void;
  /** Visually attach to the left CTA (no left rounding / shared border). */
  attached?: boolean;
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
  disabled = false,
  onBatchModeChange,
  attached = false}: OrbitBatchMenuProps) {

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
          "inline-flex h-8 shrink-0 items-center gap-1 border border-hairline-soft bg-surface-2/70 px-2 text-[11px] font-semibold text-foreground/85 transition-colors hover:border-primary/30 hover:bg-accent-soft disabled:pointer-events-none disabled:opacity-50",
          orbitControlRadius() ?? "rounded-sm",
          attached && "rounded-l-none border-l-0"
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
            "px-2 pb-1 pt-1.5 text-[9px]",
            orbitMetaMuted()
          )}
        >
          Grok batch size
        </div>
        {BATCH_OPTIONS.map((option) => {
          const active = batchMode === option.mode;
          const locked = option.mode === "deep" && !deepUnlocked;
          return (
            <button
              key={option.mode}
              type="button"
              disabled={locked}
              aria-pressed={active}
              onClick={() => onBatchModeChange(option.mode)}
              title={locked ? deepLockedReason : option.detail}
              className={cn(
                "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-accent-soft",
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
                    "block text-[10px] leading-4",
                    orbitMetaMuted()
                  )}
                >
                  {locked ? deepLockedReason : option.detail}
                </span>
              </span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
