"use client";

import {
  Compass,
  Loader2,
  Map as MapIcon,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { confidencePercent } from "@/lib/orbit-decision";
import { cn } from "@/lib/utils";
import type {
  BookmarkWithRelations,
  OrbitBookmarkDecision,
  OrbitDecision,
} from "@/types";

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

const MONO_STYLE: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
};

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
        "sticky z-[9] rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,15,29,0.95),rgba(15,23,42,0.92))] px-4 py-3 shadow-xl backdrop-blur-md sm:px-5",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <ScanSlot
          scanning={scanning}
          applying={applying}
          planSummary={planSummary}
          scanTargetCount={scanTargetCount}
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
  onScan: () => void;
  onRescan: () => void;
  onApplyAll: () => void;
}

function ScanSlot({
  scanning,
  applying,
  planSummary,
  scanTargetCount,
  onScan,
  onRescan,
  onApplyAll,
}: ScanSlotProps) {
  if (!planSummary) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <p
            className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/55"
            style={MONO_STYLE}
          >
            Ready to scan
          </p>
          <p className="mt-0.5 truncate text-sm text-white/80">
            {scanTargetCount > 0
              ? `${scanTargetCount} bookmark${
                  scanTargetCount === 1 ? "" : "s"
                } in the queue`
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
            <Sparkles className="size-3.5" />
          )}
          {scanning ? "Scanning…" : "Scan with Grok"}
        </Button>
      </div>
    );
  }

  const { scanned, remaining } = planSummary;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="min-w-0">
        <p
          className="text-[10px] font-medium uppercase tracking-[0.22em] text-sky-200/80"
          style={MONO_STYLE}
        >
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
            <Sparkles className="size-3.5" />
          )}
          Rescan
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
            <Sparkles className="size-3.5" />
          )}
          Apply all
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
      <div className="hidden min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/55 sm:inline-flex">
        <Compass className="size-3.5" />
        <span className="truncate">Select a bookmark to see its move</span>
      </div>
    );
  }

  const { bookmark, decision } = focus;
  const primary = decision.primary;
  const confidencePct = confidencePercent(decision.confidence);

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs text-white">
      <span className="inline-flex size-2 shrink-0 rounded-full bg-sky-300 shadow-[0_0_0_3px_rgba(125,211,252,0.22)] animate-pulse" />
      <span className="truncate font-medium text-white/85">
        @{bookmark.authorUsername}
      </span>
      {primary ? (
        <>
          <span className="text-white/45">→</span>
          <span className="truncate font-semibold text-white">
            {describeMove(primary)}
          </span>
        </>
      ) : (
        <span className="truncate text-white/55">No confident move</span>
      )}
      <span
        className="rounded-full border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] tabular-nums text-white/85"
        style={MONO_STYLE}
      >
        {confidencePct}%
      </span>
    </div>
  );
}

function JourneyDots({ step }: { step: JourneyStep }) {
  const order: JourneyStep[] = ["scan", "decide", "apply"];
  const activeIndex = order.indexOf(step);

  return (
    <div
      className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-white/55 md:inline-flex"
      style={MONO_STYLE}
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
                  ? "border-sky-300 bg-sky-300"
                  : isDone
                    ? "border-emerald-300/80 bg-emerald-300/80"
                    : "border-white/25 bg-transparent"
              )}
            />
            {idx < order.length - 1 && (
              <span className="h-px w-3 bg-white/15" aria-hidden />
            )}
          </span>
        );
      })}
    </div>
  );
}
