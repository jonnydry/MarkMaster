"use client";

import { useState } from "react";
import { Check, ChevronDown, Lock, Tags } from "lucide-react";

import { Button } from "@/components/ui/button";
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

/** Whole-queue auto-tag, offered beside the batch sizes. */
export interface OrbitLibraryTagOption {
  /** Untagged bookmarks in Orbit. Null while unknown (loading, or a run owns the count). */
  untaggedCount: number | null;
  available: boolean;
  unavailableReason: string;
  /** A run exists: going, or paused waiting for Resume. It shows above the queue. */
  state: "idle" | "running" | "paused";
  starting: boolean;
  onStart: () => void;
}

export interface OrbitBatchMenuProps {
  batchMode: OrbitScanBatchMode;
  resolvedBatchProfile: OrbitScanBatchProfileId;
  deepUnlocked: boolean;
  deepLockedReason: string;
  sweepUnlocked: boolean;
  sweepLockedReason: string;
  disabled?: boolean;
  onBatchModeChange: (mode: OrbitScanBatchMode) => void;
  library?: OrbitLibraryTagOption;
}

const rowClass =
  "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors";

/**
 * How much Orbit works on at once: a reviewable batch (the scan CTA's size),
 * or the whole queue auto-tagged from existing tags. Hangs off the scan CTA
 * as a caret popover — advanced, not equal-weight with the primary action.
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
  library,
}: OrbitBatchMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const triggerLabel =
    batchMode === "auto"
      ? `Auto · ${ORBIT_SCAN_BATCH_PROFILES[resolvedBatchProfile].label}`
      : ORBIT_SCAN_BATCH_PROFILES[batchMode].label;

  const untagged = library?.untaggedCount ?? null;
  const untaggedLabel =
    untagged == null ? null : untagged.toLocaleString();
  const libraryLocked =
    !library ||
    !library.available ||
    library.state !== "idle" ||
    library.starting;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirming(false);
      }}
    >
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
      <PopoverContent align="end" className="w-72 gap-1 p-1.5">
        <div className="space-y-0.5 px-2 pb-1 pt-1.5">
          <p className={orbitLabelClass()}>Review a batch</p>
          <p className="text-xs leading-4 text-muted-foreground">
            Scan suggests; nothing changes until you accept.
          </p>
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
                rowClass,
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

        {library ? (
          <div className="mt-1 border-t border-hairline-soft pt-1.5">
            <p className={cn(orbitLabelClass(), "px-2 pb-1")}>Tag everything</p>
            {confirming ? (
              <div className="space-y-2 px-2 pb-1.5 pt-0.5">
                <p className="text-xs leading-relaxed text-foreground">
                  Auto-tag {untaggedLabel ?? "every"} untagged bookmark
                  {untagged === 1 ? "" : "s"}? Confident matches from your tags
                  are applied without review. You can stop it any time.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setOpen(false);
                      setConfirming(false);
                      library.onStart();
                    }}
                  >
                    <Tags className="size-3.5" aria-hidden />
                    Start auto-tag
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={libraryLocked}
                onClick={() => setConfirming(true)}
                title={
                  library.available ? undefined : library.unavailableReason
                }
                className={cn(
                  rowClass,
                  "text-foreground",
                  highlightIdleClass,
                  libraryLocked &&
                    "cursor-not-allowed opacity-55 hover:bg-transparent"
                )}
              >
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                  {library.available ? (
                    <Tags className="size-3.5" aria-hidden />
                  ) : (
                    <Lock className="size-3 opacity-70" aria-hidden />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold">
                    {library.state === "running"
                      ? "Auto-tag is running"
                      : library.state === "paused"
                        ? "Auto-tag is paused"
                        : untaggedLabel
                        ? `Auto-tag all ${untaggedLabel}`
                        : "Auto-tag the queue"}
                  </span>
                  <span className="block text-2xs leading-4 text-muted-foreground">
                    {!library.available
                      ? library.unavailableReason
                      : library.state === "running"
                        ? "Progress shows above the queue."
                        : library.state === "paused"
                          ? "Resume or dismiss it above the queue."
                          : "Applies confident matches from your tags. No review."}
                  </span>
                </span>
              </button>
            )}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
