import { cn } from "@/lib/utils";
import {
  highlightProgressFillNoteClass,
  highlightProgressFillPrimaryClass,
  highlightProgressTrackClass,
} from "@/lib/highlight-chrome";

export type HighlightProgressTone = "primary" | "note";
export type HighlightProgressSize = "sm" | "md";

const sizeClass: Record<HighlightProgressSize, string> = {
  sm: "h-1",
  md: "h-1.5",
};

const fillClass: Record<HighlightProgressTone, string> = {
  primary: highlightProgressFillPrimaryClass,
  note: highlightProgressFillNoteClass,
};

type HighlightProgressProps = {
  percent: number;
  tone?: HighlightProgressTone;
  size?: HighlightProgressSize;
  label?: string;
  className?: string;
  durationClass?: "duration-300" | "duration-500" | "duration-700";
};

export function HighlightProgress({
  percent,
  tone = "primary",
  size = "sm",
  label,
  className,
  durationClass = "duration-700",
}: HighlightProgressProps) {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div
      className={cn(
        "highlight-progress",
        highlightProgressTrackClass,
        sizeClass[size],
        className
      )}
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(fillClass[tone], durationClass)}
        style={{ width: `${clamped}%` }}
      >
        <span
          aria-hidden
          className={cn(
            "highlight-progress-shimmer",
            tone === "note" && "highlight-progress-shimmer--note"
          )}
        />
        {clamped > 0 ? (
          <span
            aria-hidden
            className={cn(
              "highlight-progress-edge",
              tone === "note" && "highlight-progress-edge--note"
            )}
          />
        ) : null}
      </div>
    </div>
  );
}
