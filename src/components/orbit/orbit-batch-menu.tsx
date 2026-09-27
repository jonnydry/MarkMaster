"use client";

import { useState } from "react";
import { Check, ChevronDown, Lock, Tags } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  highlightIdleClass,
  highlightSegmentActiveClass,
} from "@/lib/highlight-chrome";
import { cn } from "@/lib/utils";

/** Whole-queue auto-tag, offered beside the review scan. */
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
  disabled?: boolean;
  library?: OrbitLibraryTagOption;
  triggerClassName?: string;
}

const rowClass =
  "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition-colors";

/**
 * The two tagging behaviors that actually differ: a reviewable scan, or
 * applying existing tags across the queue. Batch-size names stay internal.
 */
export function OrbitBatchMenu({
  disabled = false,
  library,
  triggerClassName,
}: OrbitBatchMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const untagged = library?.untaggedCount ?? null;
  const untaggedLabel = untagged == null ? null : untagged.toLocaleString();
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
        aria-label="Scan mode"
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1 rounded-sm border border-hairline-strong bg-background/35 px-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-hover disabled:pointer-events-none disabled:opacity-50",
          triggerClassName
        )}
        title="Scan mode"
      >
        Mode
        <ChevronDown className="size-3 opacity-60" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-1 p-1.5">
        <div className="space-y-0.5 px-2 pb-1 pt-1.5">
          <p className="text-xs font-medium text-muted-foreground">Mode</p>
          <p className="text-xs leading-4 text-muted-foreground">
            Scan queue reviews a batch. Auto-tag writes existing tags across the queue.
          </p>
        </div>
        <div
          className={cn(rowClass, highlightSegmentActiveClass)}
          aria-current="true"
        >
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
            <Check className="size-3.5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold">Review batch</span>
            <span className="block text-2xs leading-4 text-muted-foreground">
              Matches your tags, then suggests names for leftovers. Nothing is saved until you accept.
            </span>
          </span>
        </div>

        {library ? (
          <div className="mt-1 border-t border-hairline-soft pt-1.5">
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
                title={library.available ? undefined : library.unavailableReason}
                className={cn(
                  rowClass,
                  "text-foreground",
                  highlightIdleClass,
                  libraryLocked && "cursor-not-allowed opacity-55 hover:bg-transparent"
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
                          ? `Auto-tag ${untaggedLabel}`
                          : "Auto-tag the queue"}
                  </span>
                  <span className="block text-2xs leading-4 text-muted-foreground">
                    {!library.available
                      ? library.unavailableReason
                      : library.state === "running"
                        ? "Progress shows above the queue."
                        : library.state === "paused"
                          ? "Resume or dismiss it above the queue."
                          : "Applies confident matches from your existing tags. No new names, no review."}
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
