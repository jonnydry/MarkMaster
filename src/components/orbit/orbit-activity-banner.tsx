"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, PauseCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/** m:ss since this clock mounted. The banner mounts when the work starts. */
function ElapsedClock() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const minutes = Math.floor(seconds / 60);
  return (
    <span aria-label={`${seconds} seconds elapsed`}>
      {minutes}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

/**
 * Live Orbit work the queue is doing right now. Stays under the header so a
 * scan or an auto-tag pass is visible without watching the toolbar.
 */
export function OrbitActivityBanner({
  title,
  detail,
  progress = null,
  elapsed = false,
  paused = false,
  action,
  children,
}: {
  title: string;
  detail?: ReactNode;
  /** 0–1 when the work has a real count. Null draws an indeterminate bar. */
  progress?: number | null;
  /** Show a running m:ss clock, beside the percentage when there is one. */
  elapsed?: boolean;
  /** Work is waiting on the user: no spinner, no moving bar. */
  paused?: boolean;
  /** Control for the work itself (Stop, Resume). */
  action?: ReactNode;
  /** Extra detail under the bar. */
  children?: ReactNode;
}) {
  const bounded =
    progress == null ? null : Math.min(1, Math.max(0, progress));
  const percent = bounded == null ? null : Math.round(bounded * 100);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!paused}
      className="surface-inset-strong sticky top-[var(--header-height)] z-[var(--z-sticky-subbar)] overflow-hidden px-4 py-3"
    >
      <div className="flex items-start gap-3">
        {paused ? (
          <PauseCircle
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        ) : (
          <Loader2
            className="mt-0.5 size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none"
            aria-hidden
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {detail ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {detail}
            </p>
          ) : null}
        </div>
        {percent != null || elapsed ? (
          <p className="font-data mt-0.5 shrink-0 text-xs tabular-nums text-muted-foreground">
            {percent != null ? `${percent}%` : null}
            {percent != null && elapsed ? " · " : null}
            {/* Fixed slot, so the clock keeps counting when a percentage appears. */}
            {elapsed ? <ElapsedClock /> : null}
          </p>
        ) : null}
        {action ? <div className="-my-1 shrink-0">{action}</div> : null}
      </div>
      <div
        role={bounded != null ? "progressbar" : undefined}
        aria-valuemin={bounded != null ? 0 : undefined}
        aria-valuemax={bounded != null ? 100 : undefined}
        aria-valuenow={percent ?? undefined}
        aria-label={bounded != null ? title : undefined}
        aria-hidden={bounded == null ? true : undefined}
        className="mt-3 h-1 overflow-hidden rounded-[2px] bg-hairline-soft"
      >
        {bounded != null ? (
          <div
            className={cn(
              "h-full rounded-[2px] transition-[width] duration-700 ease-out motion-reduce:transition-none",
              paused ? "bg-muted-foreground" : "bg-primary"
            )}
            style={{ width: `${bounded * 100}%` }}
          />
        ) : paused ? null : (
          <div className="orbit-scan-progress-bar h-full w-1/3 bg-primary" />
        )}
      </div>
      {children}
    </div>
  );
}
