"use client";

import { cn } from "@/lib/utils";

interface ScrollingProgressBarProps {
  className?: string;
}

export function ScrollingProgressBar({ className }: ScrollingProgressBarProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 h-1 overflow-hidden bg-primary/10",
        className
      )}
      aria-hidden="true"
    >
      <div className="orbit-scan-progress-bar h-full w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent" />
    </div>
  );
}
