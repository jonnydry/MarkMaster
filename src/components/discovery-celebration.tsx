import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DiscoveryCelebrationData {
  gems: number;
  engagement: number;
}

export function DiscoveryCelebration({
  celebration,
  prefix,
  className,
}: {
  celebration: DiscoveryCelebrationData;
  prefix?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-sm border border-emerald-400/20 bg-emerald-400/5 text-sm",
        className
      )}
    >
      <div className="flex items-center gap-2 text-emerald-200">
        <Sparkles className="h-4 w-4 shrink-0" />
        <span>
          {prefix ? (
            <>
              {prefix}{" "}
            </>
          ) : null}
          queued{" "}
          <span className="font-medium tabular-nums">{celebration.gems}</span> gems
          {celebration.engagement > 0 && (
            <>
              {" "}
              · ~
              <span className="font-medium tabular-nums">
                {celebration.engagement.toLocaleString()}
              </span>{" "}
              engagements represented
            </>
          )}
        </span>
      </div>
    </div>
  );
}
