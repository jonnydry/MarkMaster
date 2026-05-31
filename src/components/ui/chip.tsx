"use client";

import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

type ChipTone = "neutral" | "primary" | "success" | "warning";

const statusToneClassName: Record<ChipTone, string> = {
  neutral: "border-hairline-soft bg-surface-2 text-muted-foreground",
  primary: "border-primary/25 bg-primary/10 text-primary",
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-100",
};

export function FilterChip({
  active,
  className,
  children,
  ...props
}: ComponentProps<"button"> & {
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-sm border border-transparent px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        active
          ? "border-primary/35 bg-primary/10 text-foreground"
          : "text-muted-foreground hover:border-hairline-soft hover:bg-accent-soft hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatusBadge({
  tone = "neutral",
  dot,
  className,
  children,
  ...props
}: ComponentProps<"span"> & {
  tone?: ChipTone;
  dot?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-0.5 text-xs font-medium",
        statusToneClassName[tone],
        className
      )}
      {...props}
    >
      {dot}
      {children}
    </span>
  );
}
