"use client";

import { useState, useSyncExternalStore } from "react";
import { Orbit, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

interface OrbitMapMotionMenuProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  /** Months Replay can cover; null when the map data can't support it. */
  replayMonths: number | null;
  onReplay: () => void;
  className?: string;
}

/**
 * Motion menu: the orbit-motion switch (rings turning by age and recent
 * activity) and Replay (the library filling in month by month). Filing and
 * arrival animations aren't here — they confirm actions and always run.
 */
export function OrbitMapMotionMenu({
  enabled,
  onEnabledChange,
  replayMonths,
  onReplay,
  className,
}: OrbitMapMotionMenuProps) {
  const [open, setOpen] = useState(false);
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  if (!ready) return null;

  const motionOn = enabled && !reducedMotion;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Motion"
        title="Motion"
        className={cn(
          "inline-flex h-8 items-center justify-center gap-1.5 rounded-sm px-2.5 text-sm font-medium transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45",
          motionOn ? "text-foreground" : "text-muted-foreground",
          className
        )}
      >
        <Orbit className="size-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Motion</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-0 p-0">
        <div className="flex items-start justify-between gap-3 border-b border-hairline-soft px-3 py-3">
          <label htmlFor="orbit-motion-switch" className="min-w-0 cursor-pointer">
            <span className="block text-sm font-medium text-foreground">Orbit motion</span>
            <span className="block text-xs text-muted-foreground">
              Rings turn by age. Homes you’ve saved to lately turn faster.
            </span>
          </label>
          <Switch
            id="orbit-motion-switch"
            checked={motionOn}
            disabled={reducedMotion}
            onCheckedChange={(checked) => onEnabledChange(checked)}
            className="mt-0.5"
          />
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-hairline-soft px-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Replay</p>
            <p className="text-xs text-muted-foreground">
              {replayMonths
                ? `Watch the last ${replayMonths} ${replayMonths === 1 ? "month" : "months"} fill in`
                : "Reload the map to replay your library"}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1"
            disabled={!replayMonths}
            onClick={() => {
              setOpen(false);
              onReplay();
            }}
          >
            <Play className="size-3.5" aria-hidden />
            Play
          </Button>
        </div>
        <p className="px-3 py-2.5 text-xs text-muted-foreground">
          {reducedMotion
            ? "Your system asks for reduced motion, so rings stay still and Replay steps a month at a time."
            : "Turns off when your system asks for reduced motion."}
        </p>
      </PopoverContent>
    </Popover>
  );
}
