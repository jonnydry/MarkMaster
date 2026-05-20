"use client";

import {
  Compass,
  Loader2,
  Map as MapIcon,
} from "lucide-react";

import { GrokMark } from "@/components/brands/grok-mark";

import { Button } from "@/components/ui/button";
import { confidenceLabel, formatConfidence } from "@/lib/orbit-decision";
import { cn } from "@/lib/utils";
import type {
  BookmarkWithRelations,
  OrbitBookmarkDecision,
  OrbitDecision,
} from "@/types";

import { orbital } from "@/components/orbital";

export type OrbitFocusScanState = "idle" | "scanning" | "ready" | "applying";

export interface OrbitFocusStripProps {
  scanState: OrbitFocusScanState;
  planSummary: { scanned: number; remaining: number } | null;
  focus: {
    bookmark: BookmarkWithRelations;
    decision: OrbitBookmarkDecision;
    predictedAnchorAvailable: boolean;
  } | null;
  scanTargetCount: number;
  scanningSelection: boolean;
  onScan: () => void;
  onRescan: () => void;
  onApplyAll: () => void;
  onOpenMap: () => void;
  /**
   * Sticky `top` offset in pixels. Should equal the height of any sibling
   * sticky chrome (e.g. the `PageHeader`) so the strip pins below it rather
   * than overlapping. Defaults to 0.
   */
  stickyTopOffset?: number;
  className?: string;
}

function describeMove(decision: OrbitDecision): string {
  return decision.kind === "collection"
    ? `Add to ${decision.label}`
    : `Tag as ${decision.label}`;
}

type JourneyStep = "scan" | "decide" | "apply";

function deriveJourney(
  scanState: OrbitFocusScanState,
  hasFocusDecision: boolean
): JourneyStep {
  if (scanState === "applying") return "apply";
  if (scanState === "idle" || scanState === "scanning") return "scan";
  if (hasFocusDecision) return "decide";
  return "scan";
}

export function OrbitFocusStrip({
  scanState,
  planSummary,
  focus,
  scanTargetCount,
  scanningSelection,
  onScan,
  onRescan,
  onApplyAll,
  onOpenMap,
  stickyTopOffset = 0,
  className,
}: OrbitFocusStripProps) {
  const scanning = scanState === "scanning";
  const applying = scanState === "applying";
  const hasFocusDecision = focus?.decision.primary !== null &&
    focus?.decision.primary !== undefined;
  const journey = deriveJourney(scanState, Boolean(hasFocusDecision));

  return (
    <section
      style={{ top: stickyTopOffset }}
      className={cn(
        orbital.glass,
        "sticky z-[9] px-4 py-3 sm:px-5",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <ScanSlot
          scanning={scanning}
          applying={applying}
          planSummary={planSummary}
          scanTargetCount={scanTargetCount}
          scanningSelection={scanningSelection}
          onScan={onScan}
          onRescan={onRescan}
          onApplyAll={onApplyAll}
        />

        <FocusSlot focus={focus} />

        <div className="ml-auto flex items-center gap-2">
          <JourneyDots step={journey} />
          <Button
            size="sm"
            variant={focus?.predictedAnchorAvailable ? "default" : "outline"}
            className={cn(
              "h-9 gap-1.5",
              focus?.predictedAnchorAvailable
                ? "bg-white text-slate-950 hover:bg-white/90"
                : "border-white/15 bg-white/5 text-white hover:bg-white/10"
            )}
            onClick={onOpenMap}
          >
            <MapIcon className="size-3.5" />
            Open map
          </Button>
        </div>
      </div>
    </section>
  );
}

interface ScanSlotProps {
  scanning: boolean;
  applying: boolean;
  planSummary: { scanned: number; remaining: number } | null;
  scanTargetCount: number;
  scanningSelection: boolean;
  onScan: () => void;
  onRescan: () => void;
  onApplyAll: () => void;
}

function ScanSlot({
  scanning,
  applying,
  planSummary,
  scanTargetCount,
  scanningSelection,
  onScan,
  onRescan,
  onApplyAll,
}: ScanSlotProps) {
  if (!planSummary) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <p className={cn(orbital.label, "text-white/55")}>
            Ready to scan
          </p>
          <p className="mt-0.5 truncate text-sm text-white/80">
            {scanTargetCount > 0
              ? `${scanTargetCount} ${scanningSelection ? "selected " : ""}bookmark${
                  scanTargetCount === 1 ? "" : "s"
                }${scanningSelection ? "" : " in the queue"}`
              : "Queue is clear"}
          </p>
        </div>
        <Button
          size="sm"
          className="h-9 gap-1.5 bg-white text-slate-950 hover:bg-white/90"
          onClick={onScan}
          disabled={scanning || scanTargetCount === 0}
        >
          {scanning ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <GrokMark className="size-3.5" title="Grok" />
          )}
          {scanning
            ? "Categorizing…"
            : scanningSelection
              ? "Auto-categorize selection"
              : "Auto-categorize queue"}
        </Button>
      </div>
    );
  }

  const { scanned, remaining } = planSummary;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="min-w-0">
        <p className={cn(orbital.label, "text-primary/80")}>
          Scanned
        </p>
        <p className="mt-0.5 truncate text-sm text-white/85">
          {scanned} bookmark{scanned === 1 ? "" : "s"}
          {remaining > 0 ? (
            <span className="text-white/55">
              {" "}
              · {remaining} left to review
            </span>
          ) : null}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-1.5 border-white/15 bg-white/5 text-white hover:bg-white/10"
          onClick={onRescan}
          disabled={scanning || applying}
        >
          {scanning ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <GrokMark className="size-3.5" title="Grok" />
          )}
          Refresh
        </Button>
        <Button
          size="sm"
          className="h-9 gap-1.5 bg-white text-slate-950 hover:bg-white/90"
          onClick={onApplyAll}
          disabled={scanning || applying || remaining === 0}
        >
          {applying ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <GrokMark className="size-3.5" title="Grok" />
          )}
          Review and apply
        </Button>
      </div>
    </div>
  );
}

function FocusSlot({
  focus,
}: {
  focus: OrbitFocusStripProps["focus"];
}) {
  if (!focus) {
    return (
      <div className={cn(orbital.pill, "hidden sm:inline-flex px-3 py-1.5 text-primary/70")}>
        <Compass className="size-3.5" />
        <span className="truncate">Select a bookmark to see its move</span>
      </div>
    );
  }

  const { bookmark, decision } = focus;
  const primary = decision.primary;
  const confidenceText = confidenceLabel(decision.confidence);

  return (
    <div className={cn(orbital.pill, "flex px-3 py-1.5 text-primary/90")}>
      <span className="inline-flex size-2 shrink-0 rounded-full bg-primary animate-pulse" />
      <span className="truncate font-medium text-primary/85">
        @{bookmark.authorUsername}
      </span>
      {primary ? (
        <>
          <span className="text-primary/45">→</span>
          <span className="truncate font-semibold text-primary">
            {describeMove(primary)}
          </span>
        </>
      ) : (
        <span className="truncate text-primary/55">No confident move</span>
      )}
      <span
        className={cn(orbital.data, "rounded-full border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] text-primary/85")}
        title={formatConfidence(decision.confidence)}
      >
        {confidenceText}
      </span>
    </div>
  );
}

function JourneyDots({ step }: { step: JourneyStep }) {
  const order: JourneyStep[] = ["scan", "decide", "apply"];
  const activeIndex = order.indexOf(step);

  return (
    <div
      className={cn(orbital.label, "hidden items-center gap-1 rounded-full border border-primary/10 bg-primary/5 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-primary/70 md:inline-flex")}
      aria-label={`Step ${activeIndex + 1} of ${order.length}`}
    >
      {order.map((id, idx) => {
        const isActive = idx === activeIndex;
        const isDone = idx < activeIndex;
        return (
          <span key={id} className="flex items-center gap-1">
            <span
              className={cn(
                "inline-block size-1.5 rounded-full border",
                isActive
                  ? "border-primary bg-primary"
                  : isDone
                    ? "border-emerald-300/80 bg-emerald-300/80"
                    : "border-primary/20 bg-transparent"
              )}
            />
            {idx < order.length - 1 && (
              <span className="h-px w-3 bg-primary/15" aria-hidden />
            )}
          </span>
        );
      })}
    </div>
  );
}
