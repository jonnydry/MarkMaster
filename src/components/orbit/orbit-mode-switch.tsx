"use client";

import Link from "next/link";
import { LayoutList, Waypoints } from "lucide-react";

import {
  highlightSegmentActiveClass,
} from "@/lib/highlight-chrome";
import { orbitHairlineBorder } from "@/lib/orbit-route-chrome";
import { cn } from "@/lib/utils";

const MODES = [
  { key: "queue", label: "Queue", icon: LayoutList },
  { key: "map", label: "Map", icon: Waypoints },
] as const;

export type OrbitMode = (typeof MODES)[number]["key"];

interface OrbitModeSwitchProps {
  /** Which surface is currently active. */
  active: OrbitMode;
  size?: "sm" | "md";
  /** Hide the text labels (icon-only), e.g. very tight chrome. */
  compact?: boolean;
  /** Override the queue destination (e.g. preserve query state). */
  queueHref?: string;
  /** Override the map destination (e.g. deep-link to a focused bookmark). */
  mapHref?: string;
  className?: string;
}

/**
 * Shared Queue⇄Map switch. Navigation, not local state — each option is a
 * prefetched Link so the transition between the two Orbit surfaces feels
 * continuous. Mirrors the ToolbarSegmentControl shell so it reads as one of the
 * family of segmented controls.
 */
export function OrbitModeSwitch({
  active,
  size = "sm",
  compact = false,
  queueHref = "/orbit",
  mapHref = "/orbit/map",
  className,
}: OrbitModeSwitchProps) {
  const buttonHeight = size === "md" ? "h-8" : "h-7";
  const hrefByMode = { queue: queueHref, map: mapHref } as const;

  return (
    <div
      role="group"
      aria-label="Orbit view"
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm border p-0.5",
        orbitHairlineBorder(),
        "bg-background/35",
        className
      )}
    >
      {MODES.map(({ key, label, icon: Icon }) => {
        const isActive = key === active;
        return (
          <Link
            key={key}
            href={hrefByMode[key]}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45",
              buttonHeight,
              isActive
                ? highlightSegmentActiveClass
                : "text-muted-foreground hover:bg-accent-soft hover:text-foreground"
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span className={cn(compact ? "sr-only" : "hidden sm:inline")}>
              {label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
