"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrbitalTheme } from "@/components/providers";
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
  const { isOrbital } = useOrbitalTheme();

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-20 w-64 p-3 shadow-none backdrop-blur-xl",
        isOrbital
          ? "rounded-sm border border-hairline-soft bg-surface-1/90"
          : "rounded-2xl border border-white/[0.08] bg-[#07111d]/72"
      )}
      style={{
        left: Math.min(Math.max(x + 14, 8), containerWidth - 264),
        top: Math.min(Math.max(y + 14, 8), containerHeight - 120),
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-block size-2 rounded-full",
            node.affiliated ? "bg-slate-200" : "bg-primary"
          )}
        />
        <span
          className={cn(
            "truncate text-xs font-semibold",
            isOrbital ? "text-foreground" : "text-white"
          )}
        >
          @{node.authorUsername}
        </span>
      </div>
      <p
        className={cn(
          "mt-1.5 line-clamp-3 text-xs leading-relaxed",
          isOrbital ? "text-muted-foreground" : "text-white/75"
        )}
      >
        {node.title}
      </p>
      {node.recent ? (
        <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-primary/80">
          <Clock className="size-3" />
          Recent
        </span>
      ) : null}
    </div>
  );
}
