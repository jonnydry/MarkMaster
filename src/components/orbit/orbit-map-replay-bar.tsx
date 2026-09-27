"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { orbitMapFloatingShellClass } from "@/lib/orbit-map-chrome";
import { formatOrbitMapReplayDate } from "@/lib/orbit-map-replay";
import { cn } from "@/lib/utils";

/** A full replay plays in about this long. */
const REPLAY_DURATION_MS = 12_000;
/** Reduced motion: step one month at this interval instead of playing. */
const REDUCED_STEP_MS = 700;
const MONTH_DAYS = 30;

interface OrbitMapReplayBarProps {
  /** How far back the replay starts, in days. */
  maxDays: number;
  /** Cutoff in days ago; null ends the replay (sent on close/unmount). */
  onCutoffChange: (cutoffDays: number | null) => void;
  onClose: () => void;
  className?: string;
}

/**
 * Replay: the library fills in from `maxDays` ago to today — bookmarks appear
 * in the month they were saved and homes grow. Play/pause, scrub, close.
 */
export function OrbitMapReplayBar({
  maxDays,
  onCutoffChange,
  onClose,
  className,
}: OrbitMapReplayBarProps) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [cutoff, setCutoff] = useState(maxDays);
  const [playing, setPlaying] = useState(true);
  const cutoffRef = useRef(maxDays);

  useEffect(() => {
    onCutoffChange(cutoff);
  }, [cutoff, onCutoffChange]);

  // End the replay whenever the bar goes away.
  useEffect(() => () => onCutoffChange(null), [onCutoffChange]);

  useEffect(() => {
    if (!playing) return;
    const advance = (days: number) => {
      const next = Math.max(0, cutoffRef.current - days);
      cutoffRef.current = next;
      setCutoff(next);
      if (next === 0) setPlaying(false);
      return next;
    };

    if (reducedMotion) {
      const id = window.setInterval(() => {
        if (advance(MONTH_DAYS) === 0) window.clearInterval(id);
      }, REDUCED_STEP_MS);
      return () => window.clearInterval(id);
    }

    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const elapsed = now - last;
      last = now;
      if (advance((elapsed / REPLAY_DURATION_MS) * maxDays) > 0) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, reducedMotion, maxDays]);

  const togglePlay = () => {
    if (!playing && cutoffRef.current === 0) {
      cutoffRef.current = maxDays;
      setCutoff(maxDays);
    }
    setPlaying((value) => !value);
  };

  return (
    <div
      role="group"
      aria-label="Replay"
      className={cn(
        orbitMapFloatingShellClass(),
        "pointer-events-auto absolute bottom-[4.25rem] left-1/2 z-30 flex w-[min(32rem,calc(100%-1.5rem))] -translate-x-1/2 items-center gap-2 px-2 py-1.5",
        className
      )}
    >
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={togglePlay}
        aria-label={playing ? "Pause replay" : "Play replay"}
        title={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <input
        type="range"
        min={0}
        max={maxDays}
        step={1}
        value={Math.round(maxDays - cutoff)}
        onChange={(event) => {
          setPlaying(false);
          const next = maxDays - Number(event.target.value);
          cutoffRef.current = next;
          setCutoff(next);
        }}
        aria-label="Replay position"
        aria-valuetext={formatOrbitMapReplayDate(cutoff)}
        className="min-w-0 flex-1 accent-primary"
      />
      <span className="w-[4.75rem] shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
        {formatOrbitMapReplayDate(cutoff)}
      </span>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={onClose}
        aria-label="Close replay"
        title="Close replay"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
