"use client";

import { useSyncExternalStore } from "react";
import { Orbit } from "lucide-react";

import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

interface OrbitMapLivingToggleProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  className?: string;
}

export function OrbitMapLivingToggle({
  enabled,
  onEnabledChange,
  className,
}: OrbitMapLivingToggleProps) {
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  if (!ready || reducedMotion) {
    return null;
  }

  return (
    <button
      type="button"
      aria-pressed={enabled}
      aria-label={enabled ? "Turn off living map motion" : "Turn on living map motion"}
      title={enabled ? "Living motion on" : "Living motion off"}
      onClick={() => onEnabledChange(!enabled)}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-sm border border-hairline-strong bg-transparent px-2.5 text-sm font-medium transition-colors hover:bg-accent-soft hover:text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45",
        enabled ? "text-foreground" : "text-muted-foreground",
        className
      )}
    >
      <Orbit className="size-4 shrink-0" aria-hidden />
      <span className="hidden sm:inline">Motion</span>
    </button>
  );
}
