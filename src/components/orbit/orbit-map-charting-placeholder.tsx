import { Loader2 } from "lucide-react";

import { orbitMapStageClass } from "@/lib/orbit-map-chrome";
import { cn } from "@/lib/utils";

/** Shared stage placeholder for graph fetch and canvas-chunk load. */
export function OrbitMapChartingPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center",
        orbitMapStageClass(),
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Charting map…
      </div>
    </div>
  );
}
