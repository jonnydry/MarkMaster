"use client";

import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ChartVariant = "card" | "flat";

const chartCardClass = "p-5";

export function ChartShell({
  variant,
  className,
  children,
}: {
  variant: ChartVariant;
  className?: string;
  children: ReactNode;
}) {
  if (variant === "flat") {
    return <section className={cn("py-6 first:pt-4", className)}>{children}</section>;
  }
  return (
    <Card className={cn(chartCardClass, "animate-fade-in-up", className)}>
      {children}
    </Card>
  );
}

export function SectionHeading({
  title,
  icon,
  meta,
  aside,
  variant = "card",
}: {
  title: string;
  icon: ReactNode;
  meta?: string;
  aside?: ReactNode;
  variant?: ChartVariant;
}) {
  if (variant === "flat") {
    return (
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold heading-font">{title}</h2>
          {meta ? <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </header>
    );
  }
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm",
            "border border-primary/15 bg-primary/10 text-primary"
          )}
        >
          {icon}
        </span>
        <h2 className="min-w-0 text-base font-semibold heading-font">{title}</h2>
      </div>
      {(meta || aside) && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 sm:shrink-0 sm:justify-end">
          {meta ? (
            <span className="text-xs tabular-nums text-muted-foreground">{meta}</span>
          ) : null}
          {aside}
        </div>
      )}
    </div>
  );
}

export function EmptyBox({ height = 180 }: { height?: number }) {
  return (
    <div
      role="status"
      style={{ height }}
      className={cn(
        "surface-inset flex items-center justify-center border-dashed text-sm text-muted-foreground"
      )}
    >
      Nothing here yet
    </div>
  );
}
