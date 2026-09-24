import { Check } from "lucide-react";
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
        "rounded-sm bg-success/10 text-sm",
        className
      )}
    >
      <div className="flex items-center gap-2 text-success">
        <Check className="size-4 shrink-0" aria-hidden />
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
