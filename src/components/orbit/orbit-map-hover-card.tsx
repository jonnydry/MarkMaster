"use client";

import { Clock } from "lucide-react";
import { orbitMapFloatingShellClass } from "@/lib/orbit-map-chrome";
import { cn } from "@/lib/utils";
import type { OrbitGraphNode } from "@/types";

export interface OrbitMapHoverCardProps {
  node: Extract<OrbitGraphNode, { kind: "bookmark" }>;
  x: number;
  y: number;
  containerWidth: number;
  containerHeight: number;
}

export function OrbitMapHoverCard({
  node,
  x,
  y,
  containerWidth,
  containerHeight,
}: OrbitMapHoverCardProps) {
  const maxLeft = Math.max(8, containerWidth - 272);
  const maxTop = Math.max(8, containerHeight - 140);
  const preferredLeft = x + 14;
  const sideAwareLeft = preferredLeft > maxLeft ? x - 278 : preferredLeft;

  return (
    <div
      data-orbit-hover-card
      className={cn(
        orbitMapFloatingShellClass(),
        "pointer-events-none absolute z-20 w-64 p-3 opacity-95 transition-[opacity,transform] duration-150 ease-out will-change-transform"
      )}
      style={{
        left: Math.min(Math.max(sideAwareLeft, 8), maxLeft),
        top: Math.min(Math.max(y + 14, 8), maxTop),
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-block size-2 rounded-full",
            node.affiliated ? "bg-muted-foreground/45" : "bg-primary"
          )}
        />
        <span className="truncate text-xs font-semibold text-foreground">
          @{node.authorUsername}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
        {node.title}
      </p>
      {node.recent ? (
        <span className="mt-1.5 inline-flex items-center gap-1 text-2xs text-primary/80">
          <Clock className="size-3" />
          Recent
        </span>
      ) : null}
    </div>
  );
}
